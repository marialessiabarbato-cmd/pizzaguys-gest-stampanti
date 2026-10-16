import { categories, products } from "@pizzaguys/db/schema";
import {
  createCategorySchema,
  createProductSchema,
  reorderCategoriesSchema,
  reorderProductsSchema,
} from "@pizzaguys/validators";
import { and, eq, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function menuRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/categories", guard, async () => {
    const brand = await getDefaultBrand(app.db);
    return app.db
      .select()
      .from(categories)
      .where(eq(categories.brandId, brand.id))
      .orderBy(categories.sortOrder);
  });

  app.post("/api/v2/categories", guard, async (req, reply) => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const [row] = await app.db
      .insert(categories)
      .values({
        brandId: brand.id,
        name: parsed.data.name,
        description: parsed.data.description,
        colorHex: parsed.data.colorHex,
        defaultVatRate: parsed.data.defaultVatRate,
        hold: parsed.data.hold,
        dessert: parsed.data.dessert,
        sortOrder: parsed.data.sortOrder,
      })
      .returning();
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "category.create",
      nextState: row,
    });
    return reply.status(201).send(row);
  });

  app.post("/api/v2/categories/reorder", guard, async (req, reply) => {
    const parsed = reorderCategoriesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    await Promise.all(
      parsed.data.ids.map((id, index) =>
        app.db
          .update(categories)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(eq(categories.id, id)),
      ),
    );
    await bumpSchemaVersion(app, brand.id);
    return { ok: true };
  });

  /** Ordine dei prodotti di una categoria (trascinamento, F19): vale per palmare e cassa. */
  app.post("/api/v2/products/reorder", guard, async (req, reply) => {
    const parsed = reorderProductsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    await Promise.all(
      parsed.data.ids.map((id, index) =>
        app.db
          .update(products)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(products.id, id), eq(products.brandId, brand.id))),
      ),
    );
    await bumpSchemaVersion(app, brand.id);
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>("/api/v2/categories/:id", guard, async (req, reply) => {
    const parsed = createCategorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(categories)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(categories.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Categoria non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/categories/:id", guard, async (req, reply) => {
    const [row] = await app.db
      .delete(categories)
      .where(eq(categories.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Categoria non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "category.delete",
      severity: "WARNING",
      previousState: row,
    });
    return { ok: true };
  });

  app.get("/api/v2/products", guard, async () => {
    const brand = await getDefaultBrand(app.db);
    return app.db
      .select()
      .from(products)
      .where(eq(products.brandId, brand.id))
      .orderBy(products.sortOrder);
  });

  app.post("/api/v2/products", guard, async (req, reply) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const [row] = await app.db
      .insert(products)
      .values({
        brandId: brand.id,
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description,
        basePrice: String(parsed.data.basePrice),
        hold: parsed.data.hold,
        dessert: parsed.data.dessert,
        allergenIds: parsed.data.allergenIds,
        // Nuovo prodotto in fondo alla sua categoria
        sortOrder:
          parsed.data.sortOrder ??
          ((
            await app.db
              .select({ m: max(products.sortOrder) })
              .from(products)
              .where(and(eq(products.brandId, brand.id), eq(products.categoryId, parsed.data.categoryId)))
          )[0]?.m ?? -1) + 1,
      })
      .returning();
    await bumpSchemaVersion(app, brand.id);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/products/:id", guard, async (req, reply) => {
    const parsed = createProductSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(products)
      .set({
        ...parsed.data,
        basePrice: parsed.data.basePrice != null ? String(parsed.data.basePrice) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(products.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Prodotto non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/products/:id", guard, async (req, reply) => {
    const [row] = await app.db.delete(products).where(eq(products.id, req.params.id)).returning();
    if (!row) return reply.status(404).send({ error: "Prodotto non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "product.delete",
      severity: "WARNING",
      previousState: row,
    });
    return { ok: true };
  });
}
