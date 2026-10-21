/**
 * Unifica tutti i gruppi varianti del brand in un solo gruppo.
 * - Resta il gruppo collegato al maggior numero di prodotti (a parità, il più vecchio).
 * - categoryIds = unione di quelle dei gruppi.
 * - Le varianti uguali (stesso tipo e stesso nome) restano una sola volta, con i dati del gruppo che resta;
 *   le altre vengono spostate in coda, nell'ordine d'origine.
 * - I gruppi svuotati vengono eliminati. Poi schemaVersion + 1: l'Edge riceve il menu al prossimo heartbeat.
 * Idempotente: con un solo gruppo non fa nulla.
 *
 *   pnpm --filter @pizzaguys/db patch:variants:unifica
 */
import { asc, eq, inArray } from "drizzle-orm";
import { createDb, closeAllDb } from "./client.js";
import { brands, products, variantGroups, variants } from "./schema/index.js";
import { bumpBrandSchemaVersion } from "./seed-menu-variants.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

function itName(name: Record<string, string> | null | undefined): string {
  return (name?.it ?? Object.values(name ?? {})[0] ?? "").trim();
}

async function main() {
  const db = createDb(DATABASE_URL);
  const brand = await db.query.brands.findFirst({ where: eq(brands.slug, "pizza-guys") });
  if (!brand) throw new Error("Brand non trovato");

  const groups = await db
    .select()
    .from(variantGroups)
    .where(eq(variantGroups.brandId, brand.id))
    .orderBy(asc(variantGroups.createdAt));
  if (groups.length <= 1) {
    console.log(`Un solo gruppo varianti (${groups.length}): niente da unificare.`);
    return;
  }

  // Prodotti collegati a ciascun gruppo
  const counts = new Map<string, number>();
  for (const g of groups) {
    const cats = g.categoryIds ?? [];
    const n = cats.length
      ? (await db.select({ id: products.id }).from(products).where(inArray(products.categoryId, cats))).length
      : 0;
    counts.set(g.id, n);
    console.log(`Gruppo "${g.name?.it ?? g.id}" (${g.id.slice(0, 8)}): ${n} prodotti, ${cats.length} categorie`);
  }
  const keep = [...groups].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))[0]!;
  const others = groups.filter((g) => g.id !== keep.id);
  console.log(`→ Resta "${keep.name?.it}" (${keep.id.slice(0, 8)})`);

  const keepRows = await db
    .select()
    .from(variants)
    .where(eq(variants.groupId, keep.id))
    .orderBy(asc(variants.sortOrder));
  const seen = new Map(keepRows.map((v) => [`${v.type}:${itName(v.name as Record<string, string>).toLowerCase()}`, v]));
  let nextOrder = keepRows.reduce((m, v) => Math.max(m, v.sortOrder ?? 0), -1) + 1;
  const categoryIds = new Set(keep.categoryIds ?? []);
  let moved = 0;
  let merged = 0;

  for (const g of others) {
    (g.categoryIds ?? []).forEach((c) => categoryIds.add(c));
    const rows = await db.select().from(variants).where(eq(variants.groupId, g.id)).orderBy(asc(variants.sortOrder));
    for (const v of rows) {
      const name = itName(v.name as Record<string, string>);
      const key = `${v.type}:${name.toLowerCase()}`;
      const same = seen.get(key);
      if (same) {
        merged += 1;
        if (Number(same.priceDelta) !== Number(v.priceDelta)) {
          console.log(`  = ${v.type} ${name}: tenuto ${same.priceDelta} € (nell'altro gruppo ${v.priceDelta} €)`);
        }
        continue;
      }
      await db.update(variants).set({ groupId: keep.id, sortOrder: nextOrder++ }).where(eq(variants.id, v.id));
      seen.set(key, { ...v, groupId: keep.id });
      moved += 1;
    }
  }

  await db.update(variantGroups).set({ categoryIds: [...categoryIds] }).where(eq(variantGroups.id, keep.id));
  for (const g of others) await db.delete(variantGroups).where(eq(variantGroups.id, g.id));
  await bumpBrandSchemaVersion(db, brand.id);

  const total = await db.select().from(variants).where(eq(variants.groupId, keep.id));
  console.log(
    `✓ Unificati ${groups.length} gruppi: ${moved} varianti spostate, ${merged} doppioni eliminati, ` +
      `${total.length} varianti totali, ${categoryIds.size} categorie. L'Edge riceve il menu entro ~60 s.`,
  );
}

main()
  .then(() => closeAllDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
