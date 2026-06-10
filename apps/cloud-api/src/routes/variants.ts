import { variantGroups, variants } from "@pizzaguys/db/schema";
import { createVariantGroupSchema, createVariantSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function variantRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/variant-groups", guard, async () => {
    const brand = await getDefaultBrand(app.db);
    const groups = await app.db.query.variantGroups.findMany({
      where: eq(variantGroups.brandId, brand.id),
    });
    const allVariants = groups.length
      ? await app.db.query.variants.findMany()
      : [];
    return groups.map((g) => ({
      ...g,
      variants: allVariants.filter((v) => v.groupId === g.id),
    }));
  });

  app.post("/api/v2/variant-groups", guard, async (req, reply) => {
    const parsed = createVariantGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const [row] = await app.db
      .insert(variantGroups)
      .values({
        brandId: brand.id,
        name: parsed.data.name,
        categoryIds: parsed.data.categoryIds,
      })
      .returning();
    await bumpSchemaVersion(app, brand.id);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/variant-groups/:id", guard, async (req, reply) => {
    const parsed = createVariantGroupSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(variantGroups)
      .set(parsed.data)
      .where(eq(variantGroups.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Gruppo non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/variant-groups/:id", guard, async (req, reply) => {
    const [row] = await app.db
      .delete(variantGroups)
      .where(eq(variantGroups.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Gruppo non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "variant_group.delete",
      severity: "WARNING",
      previousState: row,
    });
    return { ok: true };
  });

  app.post("/api/v2/variants", guard, async (req, reply) => {
    const parsed = createVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .insert(variants)
      .values({
        groupId: parsed.data.groupId,
        name: parsed.data.name,
        type: parsed.data.type,
        priceDelta: String(parsed.data.priceDelta),
      })
      .returning();
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/variants/:id", guard, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (body.priceDelta != null) body.priceDelta = Number(body.priceDelta);
    const parsed = createVariantSchema.partial().omit({ groupId: true }).safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(variants)
      .set({
        ...parsed.data,
        priceDelta: parsed.data.priceDelta != null ? String(parsed.data.priceDelta) : undefined,
      })
      .where(eq(variants.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Variante non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/variants/:id", guard, async (req, reply) => {
    const [row] = await app.db.delete(variants).where(eq(variants.id, req.params.id)).returning();
    if (!row) return reply.status(404).send({ error: "Variante non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return { ok: true };
  });
}
