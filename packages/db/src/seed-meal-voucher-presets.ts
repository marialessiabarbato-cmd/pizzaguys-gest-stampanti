import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { locationMealVoucherPresets, locations } from "./schema/index.js";
import { PILOT_LOCATION } from "./seed-menu-data.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

const DEFAULT_PRESETS = [
  { label: "€ 7", amount: 7, sortOrder: 0 },
  { label: "€ 8", amount: 8, sortOrder: 1 },
  { label: "€ 10", amount: 10, sortOrder: 2 },
];

async function main() {
  const db = createDb(DATABASE_URL);
  const location = await db.query.locations.findFirst({
    where: eq(locations.name, PILOT_LOCATION.name),
  });
  if (!location) throw new Error(`Sede ${PILOT_LOCATION.name} non trovata`);

  const existing = await db.query.locationMealVoucherPresets.findMany({
    where: eq(locationMealVoucherPresets.locationId, location.id),
  });
  if (existing.length > 0) {
    console.log(`Preset buoni pasto già presenti per ${location.name} (${existing.length})`);
    return;
  }

  for (const preset of DEFAULT_PRESETS) {
    await db.insert(locationMealVoucherPresets).values({
      locationId: location.id,
      label: preset.label,
      amount: preset.amount,
      sortOrder: preset.sortOrder,
      isActive: true,
    });
  }
  console.log(`Creati ${DEFAULT_PRESETS.length} preset buoni pasto per ${location.name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
