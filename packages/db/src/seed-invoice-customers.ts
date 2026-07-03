import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { brands, invoiceCustomerProfiles } from "./schema/index.js";
import { bumpBrandSchemaVersion } from "./seed-menu-variants.js";

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

  const existing = await db.select().from(invoiceCustomerProfiles).limit(1);
  if (existing.length > 0) {
    console.log("Clienti fiscali già presenti — skip.");
    process.exit(0);
  }

  await db.insert(invoiceCustomerProfiles).values([
    {
      brandId: brand.id,
      businessName: "542 GLOBAL SECURITY OPERATION S.R.L.",
      city: "Udine",
      province: "UD",
      country: "IT",
      vatNumber: "12345678901",
      sdiCode: "ABCDEFG",
      phone: "0432123456",
    },
    {
      brandId: brand.id,
      businessName: "A&F TELECOMUNICAZIONI S.R.L.",
      city: "San Nicola la Strada",
      province: "CE",
      country: "IT",
      vatNumber: "10987654321",
      sdiCode: "XYZAB12",
      pec: "af.telecom@pec.it",
    },
  ]);

  await bumpBrandSchemaVersion(db, brand.id);
  console.log("✓ 2 clienti fiscali di esempio creati. Ri-provisiona l'edge o attendi sync heartbeat.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
