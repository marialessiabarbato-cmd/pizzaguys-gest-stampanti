import { brandSettings } from "@pizzaguys/db/schema";
import { patchSettingsSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function settingsRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/settings", guard, async () => {
    const brand = await getDefaultBrand(app.db);
    const settings = await app.db.query.brandSettings.findFirst({
      where: eq(brandSettings.brandId, brand.id),
    });
    return settings;
  });

  app.patch("/api/v2/settings", guard, async (req, reply) => {
    const parsed = patchSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const previous = await app.db.query.brandSettings.findFirst({
      where: eq(brandSettings.brandId, brand.id),
    });
    const patch = {
      ...parsed.data,
      sdiEnabled: parsed.data.sdiEnabled === undefined ? undefined : parsed.data.sdiEnabled ? 1 : 0,
      updatedAt: new Date(),
    };
    const [row] = await app.db
      .update(brandSettings)
      .set(patch)
      .where(eq(brandSettings.brandId, brand.id))
      .returning();
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "settings.update",
      previousState: previous,
      nextState: row,
    });
    return row;
  });
}
