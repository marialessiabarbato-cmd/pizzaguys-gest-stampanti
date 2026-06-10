import { brandSettings } from "@pizzaguys/db/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function bumpSchemaVersion(app: FastifyInstance, brandId: string): Promise<number> {
  const current = await app.db.query.brandSettings.findFirst({
    where: eq(brandSettings.brandId, brandId),
  });
  if (!current) return 1;
  const next = current.schemaVersion + 1;
  await app.db
    .update(brandSettings)
    .set({ schemaVersion: next, updatedAt: new Date() })
    .where(eq(brandSettings.brandId, brandId));
  return next;
}
