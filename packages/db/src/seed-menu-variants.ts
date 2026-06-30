import { eq } from "drizzle-orm";
import type { createDb } from "./client.js";
import { brandSettings, categories, variantGroups, variants } from "./schema/index.js";
import { MENU_CATALOG, VARIANT_CATALOG } from "./seed-menu-data.js";

type Db = ReturnType<typeof createDb>;

function itName(label: string) {
  return { it: label };
}

function localizedName(name: unknown): string {
  if (name && typeof name === "object" && "it" in name) {
    return String((name as { it: string }).it);
  }
  return String(name);
}

export async function categoryKeyById(db: Db, brandId: string): Promise<Map<string, string>> {
  const rows = await db.query.categories.findMany({
    where: eq(categories.brandId, brandId),
  });
  const keyById = new Map<string, string>();
  for (const row of rows) {
    const label = localizedName(row.name);
    const catalogCat = MENU_CATALOG.find((c) => c.name === label);
    if (catalogCat) keyById.set(row.id, catalogCat.key);
  }
  return keyById;
}

export async function seedVariantCatalog(
  db: Db,
  brandId: string,
  options?: { skipIfExists?: boolean; replaceExisting?: boolean },
): Promise<{ groups: number; variants: number; skipped: boolean }> {
  const existing = await db.query.variantGroups.findMany({
    where: eq(variantGroups.brandId, brandId),
  });
  if (options?.replaceExisting && existing.length > 0) {
    for (const group of existing) {
      await db.delete(variantGroups).where(eq(variantGroups.id, group.id));
    }
  } else if (options?.skipIfExists && existing.length > 0) {
    return { groups: 0, variants: 0, skipped: true };
  } else if (existing.length > 0) {
    throw new Error(
      `Varianti già presenti (${existing.length} gruppi). Usa patch:variants:reset per sostituirle.`,
    );
  }

  const keyById = await categoryKeyById(db, brandId);
  const idByKey = new Map<string, string>();
  for (const [id, key] of keyById) idByKey.set(key, id);

  let groupCount = 0;
  let variantCount = 0;

  for (const group of VARIANT_CATALOG) {
    const categoryIds = group.categoryKeys
      .map((key) => idByKey.get(key))
      .filter((id): id is string => Boolean(id));
    if (categoryIds.length === 0) continue;

    const [row] = await db
      .insert(variantGroups)
      .values({
        brandId,
        name: itName(group.name),
        categoryIds,
      })
      .returning();
    if (!row) continue;
    groupCount += 1;

    for (const item of group.variants) {
      await db.insert(variants).values({
        groupId: row.id,
        name: itName(item.name),
        type: item.type,
        priceDelta: String(item.priceDelta),
      });
      variantCount += 1;
    }
  }

  return { groups: groupCount, variants: variantCount, skipped: false };
}

export async function bumpBrandSchemaVersion(db: Db, brandId: string): Promise<void> {
  const settings = await db.query.brandSettings.findFirst({
    where: eq(brandSettings.brandId, brandId),
  });
  if (!settings) return;
  await db
    .update(brandSettings)
    .set({ schemaVersion: settings.schemaVersion + 1, updatedAt: new Date() })
    .where(eq(brandSettings.brandId, brandId));
}
