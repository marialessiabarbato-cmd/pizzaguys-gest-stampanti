import { dailyClosures, locations, brandSettings } from "@pizzaguys/db/schema";
import { createLocationSchema, updateLocationSchema } from "@pizzaguys/validators";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { formatClosureResponse } from "../lib/closure-response.js";
import { getDefaultBrand } from "../lib/brand.js";
import { generateApiToken, hashApiToken } from "../lib/tokens.js";

function formatLocationRow(l: typeof locations.$inferSelect) {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    vatNumber: l.vatNumber,
    fiscalCode: l.fiscalCode,
    managerEmail: l.managerEmail,
    coverChargeAmount: Number(l.coverChargeAmount ?? 0),
    maxGuestCapacity: Number(l.maxGuestCapacity ?? 0),
    schemaVersion: l.schemaVersion,
    healthStatus: l.healthStatus,
    lastHeartbeatAt: l.lastHeartbeatAt,
    hasToken: Boolean(l.apiTokenHash),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

export async function locationRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/locations", guard, async () => {
    const rows = await app.db.select().from(locations).orderBy(locations.name);
    return rows.map(formatLocationRow);
  });

  app.get<{ Params: { id: string } }>("/api/v2/locations/:id", guard, async (req, reply) => {
    const row = await app.db.query.locations.findFirst({
      where: eq(locations.id, req.params.id),
    });
    if (!row) return reply.status(404).send({ error: "Sede non trovata" });
    return formatLocationRow(row);
  });

  app.post("/api/v2/locations", guard, async (req, reply) => {
    const parsed = createLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const brand = await getDefaultBrand(app.db);
    const rawToken = generateApiToken();

    const [location] = await app.db
      .insert(locations)
      .values({
        brandId: brand.id,
        name: parsed.data.name,
        address: parsed.data.address,
        vatNumber: parsed.data.vatNumber,
        fiscalCode: parsed.data.fiscalCode,
        managerEmail: parsed.data.managerEmail,
        apiTokenHash: hashApiToken(rawToken),
      })
      .returning();

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: location?.id,
      operation: "location.create",
      nextState: { id: location?.id, name: location?.name },
    });

    return reply.status(201).send({
      location,
      apiToken: rawToken,
      warning: "Salvare il token ora: non sarà più mostrato",
    });
  });

  app.patch<{ Params: { id: string } }>("/api/v2/locations/:id", guard, async (req, reply) => {
    const parsed = updateLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const existing = await app.db.query.locations.findFirst({
      where: eq(locations.id, req.params.id),
    });
    if (!existing) return reply.status(404).send({ error: "Sede non trovata" });

    const [updated] = await app.db
      .update(locations)
      .set({
        ...(parsed.data.coverChargeAmount != null
          ? { coverChargeAmount: parsed.data.coverChargeAmount }
          : {}),
        ...(parsed.data.maxGuestCapacity != null
          ? { maxGuestCapacity: parsed.data.maxGuestCapacity }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(locations.id, req.params.id))
      .returning();

    await app.db
      .update(brandSettings)
      .set({
        schemaVersion: sql`${brandSettings.schemaVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(brandSettings.brandId, existing.brandId));

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: updated?.id,
      operation: "location.update",
      previousState: {
        coverChargeAmount: existing.coverChargeAmount,
        maxGuestCapacity: existing.maxGuestCapacity,
      },
      nextState: {
        coverChargeAmount: updated?.coverChargeAmount,
        maxGuestCapacity: updated?.maxGuestCapacity,
      },
    });

    return {
      id: updated?.id,
      coverChargeAmount: Number(updated?.coverChargeAmount ?? 0),
      maxGuestCapacity: Number(updated?.maxGuestCapacity ?? 0),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/v2/locations/:id/regenerate-token",
    guard,
    async (req, reply) => {
      const rawToken = generateApiToken();
      const [updated] = await app.db
        .update(locations)
        .set({ apiTokenHash: hashApiToken(rawToken), updatedAt: new Date() })
        .where(eq(locations.id, req.params.id))
        .returning();

      if (!updated) return reply.status(404).send({ error: "Sede non trovata" });

      await writeAudit(app, {
        userId: req.user.sub,
        locationId: updated.id,
        operation: "location.regenerate_token",
        severity: "WARNING",
      });

      return { apiToken: rawToken, warning: "Salvare il token ora: non sarà più mostrato" };
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>("/api/v2/locations/:id/closures", guard, async (req, reply) => {
    const location = await app.db.query.locations.findFirst({
      where: eq(locations.id, req.params.id),
    });
    if (!location) return reply.status(404).send({ error: "Sede non trovata" });

    const conditions = [eq(dailyClosures.locationId, req.params.id)];
    if (req.query.from) conditions.push(gte(dailyClosures.closureDate, req.query.from));
    if (req.query.to) conditions.push(lte(dailyClosures.closureDate, req.query.to));

    const limit = Math.min(Number(req.query.limit ?? 90) || 90, 365);
    const rows = await app.db
      .select()
      .from(dailyClosures)
      .where(and(...conditions))
      .orderBy(desc(dailyClosures.closureDate))
      .limit(limit);

    return rows.map((row) => formatClosureResponse(row, location.name));
  });

  app.delete<{ Params: { id: string } }>(
    "/api/v2/locations/:id/token",
    guard,
    async (req, reply) => {
      const [updated] = await app.db
        .update(locations)
        .set({ apiTokenHash: null, updatedAt: new Date() })
        .where(eq(locations.id, req.params.id))
        .returning();

      if (!updated) return reply.status(404).send({ error: "Sede non trovata" });

      await writeAudit(app, {
        userId: req.user.sub,
        locationId: updated.id,
        operation: "location.revoke_token",
        severity: "CRITICAL",
      });

      return { ok: true };
    },
  );
}
