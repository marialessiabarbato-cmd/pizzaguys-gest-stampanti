import { productPrices, products } from "@pizzaguys/db/schema";
import { bulkPricePercentSchema, upsertProductPriceSchema } from "@pizzaguys/validators";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function priceRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Querystring: { locationId?: string } }>("/api/v2/product-prices", guard, async (req) => {
    const brand = await getDefaultBrand(app.db);
    const prods = await app.db.query.products.findMany({
      where: eq(products.brandId, brand.id),
      columns: { id: true },
    });
    const productIds = prods.map((p) => p.id);
    if (productIds.length === 0) return [];

    const allPrices = await app.db.query.productPrices.findMany();
    return allPrices.filter(
      (p) =>
        productIds.includes(p.productId) &&
        (!req.query.locationId || p.locationId === req.query.locationId),
    );
  });

  app.put("/api/v2/product-prices", guard, async (req, reply) => {
    const parsed = upsertProductPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const existing = await app.db.query.productPrices.findFirst({
      where: and(
        eq(productPrices.productId, parsed.data.productId),
        eq(productPrices.locationId, parsed.data.locationId),
        eq(productPrices.channel, parsed.data.channel),
      ),
    });

    let row;
    if (existing) {
      if (parsed.data.price === null) {
        [row] = await app.db
          .delete(productPrices)
          .where(eq(productPrices.id, existing.id))
          .returning();
      } else {
        [row] = await app.db
          .update(productPrices)
          .set({ price: String(parsed.data.price) })
          .where(eq(productPrices.id, existing.id))
          .returning();
      }
    } else if (parsed.data.price !== null) {
      [row] = await app.db
        .insert(productPrices)
        .values({
          productId: parsed.data.productId,
          locationId: parsed.data.locationId,
          channel: parsed.data.channel,
          price: String(parsed.data.price),
        })
        .returning();
    }

    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row ?? { ok: true };
  });

  app.post("/api/v2/product-prices/bulk-percent", guard, async (req, reply) => {
    const parsed = bulkPricePercentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const brand = await getDefaultBrand(app.db);
    const prods = await app.db.query.products.findMany({
      where: eq(products.brandId, brand.id),
    });

    const factor = 1 + parsed.data.percentChange / 100;
    let updated = 0;

    for (const prod of prods) {
      const channels = parsed.data.channel
        ? [parsed.data.channel]
        : (["TABLE", "TAKEAWAY", "DELIVERY"] as const);

      for (const channel of channels) {
        const existing = await app.db.query.productPrices.findFirst({
          where: and(
            eq(productPrices.productId, prod.id),
            eq(productPrices.locationId, parsed.data.locationId),
            eq(productPrices.channel, channel),
          ),
        });

        const base = existing?.price
          ? Number(existing.price)
          : Number(prod.basePrice);
        const newPrice = Math.max(0.01, Math.round(base * factor * 100) / 100);

        if (existing) {
          await app.db
            .update(productPrices)
            .set({ price: String(newPrice) })
            .where(eq(productPrices.id, existing.id));
        } else {
          await app.db.insert(productPrices).values({
            productId: prod.id,
            locationId: parsed.data.locationId,
            channel,
            price: String(newPrice),
          });
        }
        updated++;
      }
    }

    await bumpSchemaVersion(app, brand.id);
    return { ok: true, updated };
  });
}
