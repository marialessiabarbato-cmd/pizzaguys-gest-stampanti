import { brandSettings, categories, locations, products, users } from "@pizzaguys/db/schema";
import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getDefaultBrand } from "../lib/brand.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/api/v2/dashboard", { preHandler: [app.authenticate] }, async () => {
    const brand = await getDefaultBrand(app.db);

    const [locCount] = await app.db
      .select({ value: count() })
      .from(locations)
      .where(eq(locations.brandId, brand.id));

    const [catCount] = await app.db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.brandId, brand.id));

    const [prodCount] = await app.db
      .select({ value: count() })
      .from(products)
      .where(eq(products.brandId, brand.id));

    const [adminCount] = await app.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "USER_ADMIN"));

    const settings = await app.db.query.brandSettings.findFirst({
      where: eq(brandSettings.brandId, brand.id),
    });

    const locationRows = await app.db
      .select({
        id: locations.id,
        name: locations.name,
        healthStatus: locations.healthStatus,
        schemaVersion: locations.schemaVersion,
        lastHeartbeatAt: locations.lastHeartbeatAt,
      })
      .from(locations)
      .where(eq(locations.brandId, brand.id));

    return {
      kpi: {
        locations: locCount?.value ?? 0,
        categories: catCount?.value ?? 0,
        products: prodCount?.value ?? 0,
        userAdmins: adminCount?.value ?? 0,
        schemaVersion: settings?.schemaVersion ?? 1,
      },
      networkHealth: locationRows.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.healthStatus,
        schemaVersion: l.schemaVersion,
        lastHeartbeatAt: l.lastHeartbeatAt,
        desyncBuilds: settings ? Math.max(0, settings.schemaVersion - l.schemaVersion) : 0,
      })),
    };
  });
}
