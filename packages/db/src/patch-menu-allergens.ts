/**
 * Aggiorna allergenIds sui prodotti già seedati e incrementa schemaVersion
 * per propagare il menu all'edge al prossimo heartbeat.
 */
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { brandSettings, brands, products } from "./schema/index.js";
import { MENU_CATALOG, allergensForProduct } from "./seed-menu-data.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

function productLabel(name: unknown): string {
  if (name && typeof name === "object" && "it" in name) {
    return String((name as { it: string }).it);
  }
  return String(name);
}

async function main() {
  const db = createDb(DATABASE_URL);
  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, "pizza-guys"),
  });
  if (!brand) {
    console.error("Brand non trovato — esegui prima pnpm --filter @pizzaguys/db seed");
    process.exit(1);
  }

  const nameToMeta = new Map<string, { categoryKey: string }>();
  for (const cat of MENU_CATALOG) {
    for (const item of cat.products) {
      nameToMeta.set(item.name, { categoryKey: cat.key });
    }
  }

  const rows = await db.query.products.findMany({
    where: eq(products.brandId, brand.id),
  });

  let updated = 0;
  for (const row of rows) {
    const label = productLabel(row.name);
    const meta = nameToMeta.get(label);
    if (!meta) continue;
    const allergenIds = allergensForProduct(meta.categoryKey, label);
    const current = row.allergenIds ?? [];
    const same =
      current.length === allergenIds.length &&
      allergenIds.every((id) => current.includes(id));
    if (same) continue;
    await db.update(products).set({ allergenIds }).where(eq(products.id, row.id));
    updated += 1;
  }

  const settings = await db.query.brandSettings.findFirst({
    where: eq(brandSettings.brandId, brand.id),
  });
  if (settings) {
    await db
      .update(brandSettings)
      .set({ schemaVersion: settings.schemaVersion + 1, updatedAt: new Date() })
      .where(eq(brandSettings.brandId, brand.id));
    console.log(`✓ schemaVersion → ${settings.schemaVersion + 1}`);
  }

  const withAllergens = rows.filter((r) => {
    const label = productLabel(r.name);
    const meta = nameToMeta.get(label);
    return meta && allergensForProduct(meta.categoryKey, label).length > 0;
  }).length;

  console.log(`✓ ${updated} prodotti aggiornati (${withAllergens} con allergeni nel catalogo)`);
  console.log("  L'edge riceverà il delta entro ~60s (heartbeat) oppure riavvia provision.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
