import { brands } from "@pizzaguys/db/schema";
import { eq } from "drizzle-orm";
import type { Database } from "@pizzaguys/db";

export async function getDefaultBrand(db: Database) {
  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, "pizza-guys"),
  });
  if (!brand) throw new Error("Brand non trovato. Eseguire: pnpm --filter @pizzaguys/db seed");
  return brand;
}
