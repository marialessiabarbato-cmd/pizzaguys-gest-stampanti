import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import {
  brands,
  categories,
  locations,
  productPrices,
  products,
} from "./schema/index.js";
import { MENU_CATALOG, PILOT_LOCATION, allergensForProduct } from "./seed-menu-data.js";
import { bumpBrandSchemaVersion, seedVariantCatalog } from "./seed-menu-variants.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateApiToken(): string {
  return `pg_${randomBytes(32).toString("hex")}`;
}

function itName(label: string) {
  return { it: label };
}

async function main() {
  const db = createDb(DATABASE_URL);

  const brand = await db.query.brands.findFirst({
    where: eq(brands.slug, "pizza-guys"),
  });
  if (!brand) {
    console.error("Esegui prima: pnpm --filter @pizzaguys/db seed");
    process.exit(1);
  }
  const brandId = brand.id;

  const existingCategories = await db.query.categories.findMany({
    where: eq(categories.brandId, brandId),
  });
  if (existingCategories.length > 0) {
    console.log(`Menu già presente (${existingCategories.length} categorie). Skip.`);
    process.exit(0);
  }

  let location = await db.query.locations.findFirst({
    where: eq(locations.name, PILOT_LOCATION.name),
  });
  let apiToken: string | undefined;

  if (!location) {
    apiToken = generateApiToken();
    const [created] = await db
      .insert(locations)
      .values({
        brandId,
        name: PILOT_LOCATION.name,
        address: PILOT_LOCATION.address,
        vatNumber: PILOT_LOCATION.vatNumber,
        managerEmail: PILOT_LOCATION.managerEmail,
        apiTokenHash: hashApiToken(apiToken),
      })
      .returning();
    location = created;
    console.log(`✓ Sede pilota: ${PILOT_LOCATION.name}`);
    console.log(`  API token (salvare ora): ${apiToken}`);
  } else {
    console.log(`✓ Sede pilota già esistente: ${location.name}`);
  }

  if (!location) throw new Error("Impossibile creare la sede pilota");

  let productCount = 0;
  for (const [catIndex, cat] of MENU_CATALOG.entries()) {
    const [category] = await db
      .insert(categories)
      .values({
        brandId,
        name: itName(cat.name),
        colorHex: cat.colorHex,
        defaultVatRate: cat.defaultVatRate,
        hold: cat.hold ?? false,
        dessert: cat.dessert ?? false,
        sortOrder: catIndex,
      })
      .returning();

    if (!category) continue;

    for (const [prodIndex, item] of cat.products.entries()) {
      const [product] = await db
        .insert(products)
        .values({
          brandId,
          categoryId: category.id,
          name: itName(item.name),
          basePrice: String(item.price),
          dessert: cat.dessert ?? false,
          allergenIds: item.allergenIds ?? allergensForProduct(cat.key, item.name),
          sortOrder: prodIndex,
        })
        .returning();

      if (!product) continue;
      productCount += 1;

      for (const channel of ["TABLE", "TAKEAWAY", "DELIVERY"] as const) {
        const channelDelta = channel === "DELIVERY" ? 1 : channel === "TAKEAWAY" ? 0.5 : 0;
        const price = Math.round((item.price + channelDelta) * 100) / 100;
        await db.insert(productPrices).values({
          productId: product.id,
          locationId: location.id,
          channel,
          price: String(price),
        });
      }
    }
  }

  const variantResult = await seedVariantCatalog(db, brandId);

  const { invoiceCustomerProfiles } = await import("./schema/invoice-customers.js");
  const existingCustomers = await db.select().from(invoiceCustomerProfiles).limit(1);
  if (existingCustomers.length === 0) {
    await db.insert(invoiceCustomerProfiles).values([
      {
        brandId,
        businessName: "542 GLOBAL SECURITY OPERATION S.R.L.",
        city: "Udine",
        province: "UD",
        country: "IT",
        vatNumber: "12345678901",
        sdiCode: "ABCDEFG",
        phone: "0432123456",
      },
      {
        brandId,
        businessName: "A&F TELECOMUNICAZIONI S.R.L.",
        city: "San Nicola la Strada",
        province: "CE",
        country: "IT",
        vatNumber: "10987654321",
        sdiCode: "XYZAB12",
        pec: "af.telecom@pec.it",
      },
    ]);
    console.log("✓ 2 clienti fiscali di esempio in rubrica");
  }

  await bumpBrandSchemaVersion(db, brandId);

  console.log(`✓ ${MENU_CATALOG.length} categorie, ${productCount} prodotti`);
  console.log(`✓ ${variantResult.groups} gruppi varianti, ${variantResult.variants} varianti`);
  console.log(`✓ Prezzi TABLE/TAKEAWAY/DELIVERY per sede ${location.name}`);
  console.log("  Provisioning edge: incolla il token in Main Station → Provision");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
