/**
 * Inserisce gruppi varianti pilota su menu già seedato e incrementa schemaVersion
 * per propagare il delta all'edge al prossimo heartbeat.
 */
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { brands } from "./schema/index.js";
import { bumpBrandSchemaVersion, seedVariantCatalog } from "./seed-menu-variants.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

async function main() {
  const db = createDb(DATABASE_URL);
  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, "pizza-guys"),
  });
  if (!brand) {
    console.error("Brand non trovato — esegui prima pnpm --filter @pizzaguys/db seed");
    process.exit(1);
  }

  const result = await seedVariantCatalog(db, brand.id, { skipIfExists: true });
  if (result.skipped) {
    console.log("Varianti già presenti. Nessuna modifica.");
    process.exit(0);
  }

  await bumpBrandSchemaVersion(db, brand.id);
  console.log(`✓ ${result.groups} gruppi varianti, ${result.variants} varianti inseriti`);
  console.log("  L'edge riceverà il delta entro ~60s (heartbeat) oppure riavvia provision.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
