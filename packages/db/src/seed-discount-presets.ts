import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { locationDiscountPresets, locations } from "./schema/index.js";
import { PILOT_LOCATION } from "./seed-menu-data.js";
import { bumpBrandSchemaVersion } from "./seed-menu-variants.js";
import { brands } from "./schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

async function main() {
  const db = createDb(DATABASE_URL);
  const location = await db.query.locations.findFirst({
    where: eq(locations.name, PILOT_LOCATION.name),
  });
  if (!location) {
    console.error("Sede pilota non trovata — esegui prima pnpm --filter @pizzaguys/db seed:menu");
    process.exit(1);
  }

  const existing = await db
    .select()
    .from(locationDiscountPresets)
    .where(eq(locationDiscountPresets.locationId, location.id))
    .limit(1);
  if (existing.length > 0) {
    console.log("Sconti sede già presenti — skip.");
    process.exit(0);
  }

  await db.insert(locationDiscountPresets).values([
    { locationId: location.id, label: "Staff 10%", percent: 10, sortOrder: 0 },
    { locationId: location.id, label: "Amici 15%", percent: 15, sortOrder: 1 },
  ]);

  const brand = await db.query.brands.findFirst({ where: eq(brands.slug, "pizza-guys") });
  if (brand) await bumpBrandSchemaVersion(db, brand.id);

  console.log(`✓ Sconti rapidi creati per ${location.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
