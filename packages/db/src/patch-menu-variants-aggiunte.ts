/**
 * Per ogni variante "Togli X" (REMOVE) crea la corrispondente "Aggiungi X" (ADD) a +1 €,
 * nello stesso gruppo varianti. Idempotente: salta le aggiunte già presenti (stesso nome,
 * stesso gruppo) senza toccarne il prezzo. Poi incrementa schemaVersion: l'Edge riceve il
 * menu aggiornato al prossimo heartbeat.
 *
 *   pnpm --filter @pizzaguys/db patch:variants:aggiunte
 */
import { eq } from "drizzle-orm";
import { createDb, closeAllDb } from "./client.js";
import { brands, variantGroups, variants } from "./schema/index.js";
import { bumpBrandSchemaVersion } from "./seed-menu-variants.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

const PRICE_DELTA = 1;

function itName(name: Record<string, string> | null | undefined): string {
  return (name?.it ?? Object.values(name ?? {})[0] ?? "").trim();
}

async function main() {
  const db = createDb(DATABASE_URL);
  const brand = await db.query.brands.findFirst({ where: eq(brands.slug, "pizza-guys") });
  if (!brand) throw new Error("Brand non trovato");

  const groups = await db.select().from(variantGroups).where(eq(variantGroups.brandId, brand.id));
  let added = 0;
  let skipped = 0;
  for (const g of groups) {
    const rows = await db.select().from(variants).where(eq(variants.groupId, g.id));
    const haveAdd = new Set(
      rows.filter((v) => v.type === "ADD").map((v) => itName(v.name as Record<string, string>).toLowerCase()),
    );
    let nextOrder = rows.reduce((m, v) => Math.max(m, v.sortOrder ?? 0), -1) + 1;
    const removals = rows.filter((v) => v.type === "REMOVE");
    if (removals.length === 0) continue;
    console.log(`Gruppo "${g.name?.it ?? g.id}": ${removals.length} rimozioni`);
    for (const r of removals) {
      const name = itName(r.name as Record<string, string>);
      const key = name.toLowerCase();
      if (!name || haveAdd.has(key)) {
        skipped += 1;
        if (name) console.log(`  = Aggiungi ${name}: già presente, invariata`);
        continue;
      }
      await db.insert(variants).values({
        groupId: g.id,
        name: { it: name },
        type: "ADD",
        priceDelta: String(PRICE_DELTA),
        sortOrder: nextOrder++,
      });
      haveAdd.add(key);
      added += 1;
      console.log(`  + Aggiungi ${name} (+${PRICE_DELTA} €)`);
    }
  }

  if (added > 0) {
    await bumpBrandSchemaVersion(db, brand.id);
    console.log(`✓ ${added} aggiunte create (${skipped} già presenti). L'Edge riceve il menu entro ~60 s.`);
  } else {
    console.log(`Nessuna aggiunta nuova (${skipped} già presenti).`);
  }
}

main()
  .then(() => closeAllDb())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
