import {
  brandSettings,
  categories,
  dailyClosures,
  locations,
  productPrices,
  products,
  variantGroups,
  variants,
} from "@pizzaguys/db/schema";
import { provHandshakeSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { hashApiToken } from "../lib/tokens.js";

const heartbeatSchema = z.object({
  apiToken: z.string().min(1),
  schemaVersion: z.number().int().min(0),
});

async function buildCatalogSnapshot(
  app: FastifyInstance,
  brandId: string,
  locationId: string,
  schemaVersion: number,
) {
  const cats = await app.db.query.categories.findMany({
    where: eq(categories.brandId, brandId),
  });
  const prods = await app.db.query.products.findMany({
    where: eq(products.brandId, brandId),
  });
  const groups = await app.db.query.variantGroups.findMany({
    where: eq(variantGroups.brandId, brandId),
  });
  const vars = groups.length ? await app.db.query.variants.findMany() : [];
  const prices = await app.db.query.productPrices.findMany({
    where: eq(productPrices.locationId, locationId),
  });
  const settings = await app.db.query.brandSettings.findFirst({
    where: eq(brandSettings.brandId, brandId),
  });
  const location = await app.db.query.locations.findFirst({
    where: eq(locations.id, locationId),
  });

  return {
    schemaVersion,
    categories: cats,
    products: prods,
    variantGroups: groups.map((g) => ({
      ...g,
      variants: vars.filter((v) => v.groupId === g.id),
    })),
    prices,
    settings: {
      maxDiscountPercent: settings?.maxDiscountPercent ?? 20,
      tableLockTimeoutMinutes: settings?.tableLockTimeoutMinutes ?? 15,
      deliveryBrokers: settings?.deliveryBrokers ?? [],
      coverChargeAmount: Number(location?.coverChargeAmount ?? 0),
    },
  };
}

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/v2/prov/handshake", async (req, reply) => {
    const parsed = provHandshakeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Payload non valido", details: parsed.error.flatten() });
    }

    const hash = hashApiToken(parsed.data.apiToken);
    const location = await app.db.query.locations.findFirst({
      where: eq(locations.apiTokenHash, hash),
    });

    if (!location) {
      return reply.status(401).send({ error: "Token non valido o revocato" });
    }

    const settings = await app.db.query.brandSettings.findFirst({
      where: eq(brandSettings.brandId, location.brandId),
    });

    const schemaVersion = settings?.schemaVersion ?? 1;

    await app.db
      .update(locations)
      .set({
        lastHeartbeatAt: new Date(),
        healthStatus: "ONLINE",
        schemaVersion: parsed.data.schemaVersion ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    const snapshot = await buildCatalogSnapshot(
      app,
      location.brandId,
      location.id,
      schemaVersion,
    );

    return {
      locationId: location.id,
      locationName: location.name,
      schemaVersion,
      snapshot,
    };
  });

  app.post("/api/v2/sync/heartbeat", async (req, reply) => {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Payload non valido", details: parsed.error.flatten() });
    }

    const hash = hashApiToken(parsed.data.apiToken);
    const location = await app.db.query.locations.findFirst({
      where: eq(locations.apiTokenHash, hash),
    });
    if (!location) {
      return reply.status(401).send({ error: "Token non valido o revocato" });
    }

    const settings = await app.db.query.brandSettings.findFirst({
      where: eq(brandSettings.brandId, location.brandId),
    });
    const cloudVersion = settings?.schemaVersion ?? 1;
    const desyncBuilds = Math.max(0, cloudVersion - parsed.data.schemaVersion);
    const healthStatus = desyncBuilds > 0 ? "DESYNC" : "ONLINE";

    await app.db
      .update(locations)
      .set({
        lastHeartbeatAt: new Date(),
        healthStatus,
        schemaVersion: parsed.data.schemaVersion,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, location.id));

    return {
      ok: true,
      cloudSchemaVersion: cloudVersion,
      desyncBuilds,
      healthStatus,
    };
  });

  app.get<{ Querystring: { locationId: string; sinceVersion?: string; apiToken?: string } }>(
    "/api/v2/sync/delta",
    async (req, reply) => {
      const { locationId, sinceVersion, apiToken } = req.query;
      if (!locationId) {
        return reply.status(400).send({ error: "locationId obbligatorio" });
      }

      const location = await app.db.query.locations.findFirst({
        where: eq(locations.id, locationId),
      });
      if (!location) return reply.status(404).send({ error: "Sede non trovata" });

      if (apiToken) {
        const hash = hashApiToken(apiToken);
        if (location.apiTokenHash !== hash) {
          return reply.status(401).send({ error: "Token non valido" });
        }
      }

      const settings = await app.db.query.brandSettings.findFirst({
        where: eq(brandSettings.brandId, location.brandId),
      });

      const since = Number(sinceVersion ?? 0);
      const current = settings?.schemaVersion ?? 1;

      if (current - since > 50) {
        return reply.status(409).send({
          error: "Versione troppo obsoleta",
          code: "FULL_SNAPSHOT_REQUIRED",
          schemaVersion: current,
        });
      }

      if (since >= current) {
        return { schemaVersion: current, delta: null };
      }

      const snapshot = await buildCatalogSnapshot(
        app,
        location.brandId,
        location.id,
        current,
      );

      return {
        schemaVersion: current,
        delta: snapshot,
      };
    },
  );

  const dailyClosureSchema = z.object({
    locationId: z.string().uuid(),
    closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fiscalZNumber: z.number().int().positive().optional(),
    totals: z.object({
      gross: z.number(),
      byChannel: z.record(z.number()),
      byPaymentMethod: z.record(z.number()),
    }),
    reconciliation: z.object({
      cashDeclared: z.number(),
      posDeclared: z.number(),
      discrepancy: z.number(),
    }),
    receipts: z.array(z.unknown()).default([]),
  });

  app.post("/api/v2/sync/daily-closure", async (req, reply) => {
    const auth = req.headers.authorization;
    const apiToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!apiToken) {
      return reply.status(401).send({ error: "Token mancante" });
    }

    const parsed = dailyClosureSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Payload non valido", details: parsed.error.flatten() });
    }

    const hash = hashApiToken(apiToken);
    const location = await app.db.query.locations.findFirst({
      where: eq(locations.id, parsed.data.locationId),
    });
    if (!location || location.apiTokenHash !== hash) {
      return reply.status(401).send({ error: "Token non valido o sede non corrispondente" });
    }

    const receivedAt = new Date();
    const gross = String(parsed.data.totals.gross);
    const cashDeclared = String(parsed.data.reconciliation.cashDeclared);
    const posDeclared = String(parsed.data.reconciliation.posDeclared);
    const discrepancy = String(parsed.data.reconciliation.discrepancy);

    await app.db
      .insert(dailyClosures)
      .values({
        locationId: location.id,
        closureDate: parsed.data.closureDate,
        fiscalZNumber: parsed.data.fiscalZNumber ?? null,
        gross,
        cashDeclared,
        posDeclared,
        discrepancy,
        byChannel: parsed.data.totals.byChannel,
        byPaymentMethod: parsed.data.totals.byPaymentMethod,
        receipts: parsed.data.receipts,
        receivedAt,
        updatedAt: receivedAt,
      })
      .onConflictDoUpdate({
        target: [dailyClosures.locationId, dailyClosures.closureDate],
        set: {
          fiscalZNumber: parsed.data.fiscalZNumber ?? null,
          gross,
          cashDeclared,
          posDeclared,
          discrepancy,
          byChannel: parsed.data.totals.byChannel,
          byPaymentMethod: parsed.data.totals.byPaymentMethod,
          receipts: parsed.data.receipts,
          receivedAt,
          updatedAt: receivedAt,
        },
      });

    const receivedAtIso = receivedAt.toISOString();
    await writeAudit(app, {
      locationId: location.id,
      operation: "DAILY_CLOSURE_SYNC",
      severity: parsed.data.reconciliation.discrepancy !== 0 ? "WARNING" : "INFO",
      nextState: { ...parsed.data, receivedAt: receivedAtIso },
    });

    app.log.info(
      { locationId: location.id, closureDate: parsed.data.closureDate },
      "Daily closure persisted",
    );

    return reply.status(200).send({ ok: true, receivedAt: receivedAtIso });
  });
}
