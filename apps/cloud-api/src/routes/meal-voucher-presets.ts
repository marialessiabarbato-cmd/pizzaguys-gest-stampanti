import {
  createLocationMealVoucherPresetSchema,
  updateLocationMealVoucherPresetSchema,
} from "@pizzaguys/validators";
import { locationMealVoucherPresets } from "@pizzaguys/db/schema";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";
import { getDefaultBrand } from "../lib/brand.js";

export async function locationMealVoucherPresetRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Params: { locationId: string } }>(
    "/api/v2/locations/:locationId/meal-voucher-presets",
    guard,
    async (req) => {
      return app.db
        .select()
        .from(locationMealVoucherPresets)
        .where(eq(locationMealVoucherPresets.locationId, req.params.locationId))
        .orderBy(
          asc(locationMealVoucherPresets.sortOrder),
          asc(locationMealVoucherPresets.label),
        );
    },
  );

  app.post<{ Params: { locationId: string } }>(
    "/api/v2/locations/:locationId/meal-voucher-presets",
    guard,
    async (req, reply) => {
      const parsed = createLocationMealVoucherPresetSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const brand = await getDefaultBrand(app.db);
      const [row] = await app.db
        .insert(locationMealVoucherPresets)
        .values({
          locationId: req.params.locationId,
          label: parsed.data.label,
          amount: parsed.data.amount,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();

      await bumpSchemaVersion(app, brand.id);
      await writeAudit(app, {
        userId: req.user.sub,
        locationId: req.params.locationId,
        operation: "meal_voucher_preset.create",
        nextState: row,
      });

      return reply.status(201).send(row);
    },
  );

  app.patch<{ Params: { locationId: string; id: string } }>(
    "/api/v2/locations/:locationId/meal-voucher-presets/:id",
    guard,
    async (req, reply) => {
      const parsed = updateLocationMealVoucherPresetSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const brand = await getDefaultBrand(app.db);
      const [row] = await app.db
        .update(locationMealVoucherPresets)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(locationMealVoucherPresets.id, req.params.id))
        .returning();

      if (!row || row.locationId !== req.params.locationId) {
        return reply.status(404).send({ error: "Preset non trovato" });
      }

      await bumpSchemaVersion(app, brand.id);
      return row;
    },
  );

  app.delete<{ Params: { locationId: string; id: string } }>(
    "/api/v2/locations/:locationId/meal-voucher-presets/:id",
    guard,
    async (req, reply) => {
      const brand = await getDefaultBrand(app.db);
      const existing = await app.db.query.locationMealVoucherPresets.findFirst({
        where: eq(locationMealVoucherPresets.id, req.params.id),
      });
      if (!existing || existing.locationId !== req.params.locationId) {
        return reply.status(404).send({ error: "Preset non trovato" });
      }

      await app.db
        .delete(locationMealVoucherPresets)
        .where(eq(locationMealVoucherPresets.id, req.params.id));
      await bumpSchemaVersion(app, brand.id);
      return reply.status(204).send();
    },
  );
}
