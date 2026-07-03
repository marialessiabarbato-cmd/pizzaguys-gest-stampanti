import { locationDiscountPresets } from "@pizzaguys/db/schema";
import {
  createLocationDiscountPresetSchema,
  updateLocationDiscountPresetSchema,
} from "@pizzaguys/validators";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";
import { getDefaultBrand } from "../lib/brand.js";

export async function locationDiscountPresetRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Params: { locationId: string } }>(
    "/api/v2/locations/:locationId/discount-presets",
    guard,
    async (req) => {
      return app.db
        .select()
        .from(locationDiscountPresets)
        .where(eq(locationDiscountPresets.locationId, req.params.locationId))
        .orderBy(asc(locationDiscountPresets.sortOrder), asc(locationDiscountPresets.label));
    },
  );

  app.post<{ Params: { locationId: string } }>(
    "/api/v2/locations/:locationId/discount-presets",
    guard,
    async (req, reply) => {
      const parsed = createLocationDiscountPresetSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const brand = await getDefaultBrand(app.db);
      const [row] = await app.db
        .insert(locationDiscountPresets)
        .values({
          locationId: req.params.locationId,
          label: parsed.data.label,
          percent: parsed.data.percent,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();

      await bumpSchemaVersion(app, brand.id);
      await writeAudit(app, {
        userId: req.user.sub,
        locationId: req.params.locationId,
        operation: "discount_preset.create",
        nextState: row,
      });

      return reply.status(201).send(row);
    },
  );

  app.patch<{ Params: { locationId: string; id: string } }>(
    "/api/v2/locations/:locationId/discount-presets/:id",
    guard,
    async (req, reply) => {
      const parsed = updateLocationDiscountPresetSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const brand = await getDefaultBrand(app.db);
      const [row] = await app.db
        .update(locationDiscountPresets)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(locationDiscountPresets.id, req.params.id))
        .returning();

      if (!row || row.locationId !== req.params.locationId) {
        return reply.status(404).send({ error: "Sconto non trovato" });
      }

      await bumpSchemaVersion(app, brand.id);
      return row;
    },
  );

  app.delete<{ Params: { locationId: string; id: string } }>(
    "/api/v2/locations/:locationId/discount-presets/:id",
    guard,
    async (req, reply) => {
      const brand = await getDefaultBrand(app.db);
      const existing = await app.db.query.locationDiscountPresets.findFirst({
        where: eq(locationDiscountPresets.id, req.params.id),
      });
      if (!existing || existing.locationId !== req.params.locationId) {
        return reply.status(404).send({ error: "Sconto non trovato" });
      }

      await app.db.delete(locationDiscountPresets).where(eq(locationDiscountPresets.id, req.params.id));
      await bumpSchemaVersion(app, brand.id);
      return reply.status(204).send();
    },
  );
}
