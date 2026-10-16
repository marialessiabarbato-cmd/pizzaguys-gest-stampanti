/**
 * Varianti emerse nei test in loco del 15/10 (F7), aggiunte al gruppo varianti collegato
 * al maggior numero di prodotti. Idempotente: salta le varianti già presenti nel gruppo.
 * Poi incrementa schemaVersion: l'Edge riceve il menu aggiornato al prossimo heartbeat.
 *
 *   pnpm --filter @pizzaguys/db patch:variants:extra
 */
import { eq, inArray } from "drizzle-orm";
import { createDb, closeAllDb } from "./client.js";
import { brands, categories, products, variantGroups, variants } from "./schema/index.js";
import { bumpBrandSchemaVersion } from "./seed-menu-variants.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

/** Aggiunte a +2 € (decisione 16/10, provvisoria). Rimozioni a 0 €. */
export const EXTRA_VARIANTS: Array<{ name: string; type: "ADD" | "REMOVE"; priceDelta: number }> = [
  { name: "Mayo", type: "ADD", priceDelta: 2 },
  { name: "Mayo paprika", type: "ADD", priceDelta: 2 },
  { name: "Mayo porcini", type: "ADD", priceDelta: 2 },
  { name: "Ketchup", type: "ADD", priceDelta: 2 },
  { name: "Salsa Barbecue", type: "ADD", priceDelta: 2 },
  { name: "Senza lattosio", type: "ADD", priceDelta: 2 },
  { name: "Pizza bianca (base bianca + mozzarella)", type: "ADD", priceDelta: 2 },
  { name: "Pomodorini", type: "ADD", priceDelta: 2 },
  { name: "Patatine", type: "ADD", priceDelta: 2 },
  { name: "Fesa", type: "REMOVE", priceDelta: 0 },
  { name: "Sambal", type: "REMOVE", priceDelta: 0 },
  { name: "Salsa teriyaki", type: "REMOVE", priceDelta: 0 },
  { name: "Miele", type: "REMOVE", priceDelta: 0 },
];

function itName(name: Record<string, string> | null | undefined): string {
  return (name?.it ?? Object.values(name ?? {})[0] ?? "").trim().toLowerCase();
}

async function main() {
  const db = createDb(DATABASE_URL);
  const brand = await db.query.brands.findFirst({ where: eq(brands.slug, "pizza-guys") });
  if (!brand) throw new Error("Brand non trovato");

  const groups = await db.select().from(variantGroups).where(eq(variantGroups.brandId, brand.id));
  if (groups.length === 0) throw new Error("Nessun gruppo varianti: esegui prima patch:variants");

  // Gruppo con più prodotti collegati (tramite le categorie del gruppo)
  let best = groups[0]!;
  let bestCount = -1;
  for (const g of groups) {
    const catIds = g.categoryIds ?? [];
    const count = catIds.length
      ? (await db.select({ id: products.id }).from(products).where(inArray(products.categoryId, catIds))).length
      : 0;
    if (count > bestCount) {
      best = g;
      bestCount = count;
    }
  }
  const cats = (best.categoryIds ?? []).length
    ? await db.select().from(categories).where(inArray(categories.id, best.categoryIds))
    : [];
  console.log(
    `Gruppo scelto: "${best.name?.it ?? best.id}" — ${bestCount} prodotti (${cats.map((c) => itName(c.name as Record<string, string>)).join(", ")})`,
  );

  const existing = await db.select().from(variants).where(eq(variants.groupId, best.id));
  const have = new Set(existing.map((v) => `${v.type}:${itName(v.name as Record<string, string>)}`));
  let added = 0;
  for (const v of EXTRA_VARIANTS) {
    if (have.has(`${v.type}:${v.name.toLowerCase()}`)) continue;
    await db.insert(variants).values({
      groupId: best.id,
      name: { it: v.name },
      type: v.type,
      priceDelta: String(v.priceDelta),
    });
    added += 1;
    console.log(`  + ${v.type === "ADD" ? "Aggiungi" : "Togli"} ${v.name}${v.priceDelta ? ` (+${v.priceDelta} €)` : ""}`);
  }

  if (added > 0) {
    await bumpBrandSchemaVersion(db, brand.id);
    console.log(`✓ ${added} varianti aggiunte. L'Edge riceve il menu entro ~60 s.`);
  } else {
    console.log("Nessuna variante nuova: erano già tutte presenti.");
  }
}

main()
  .then(() => closeAllDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
