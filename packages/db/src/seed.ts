import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { brandSettings, brands, users } from "./schema/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@pizzaguys.it";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "PizzaGuys2026!";

async function main() {
  const db = createDb(DATABASE_URL);

  const existing = await db.query.brands.findFirst({
    where: eq(brands.slug, "pizza-guys"),
  });

  if (existing) {
    console.log("Seed già eseguito (brand pizza-guys presente).");
    process.exit(0);
  }

  const [brand] = await db
    .insert(brands)
    .values({ name: "Pizza Guys", slug: "pizza-guys" })
    .returning();

  if (!brand) throw new Error("Impossibile creare il brand");

  await db.insert(brandSettings).values({
    brandId: brand.id,
    maxDiscountPercent: 20,
    tableLockTimeoutMinutes: 15,
    sdiEnabled: 0,
    deliveryBrokers: ["Glovo", "Deliveroo"],
    schemaVersion: 1,
  });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    passwordHash,
    firstName: "Super",
    lastName: "Admin",
    role: "SUPER_ADMIN",
  });

  console.log("✓ Brand Pizza Guys creato");
  console.log(`✓ SuperAdmin: ${ADMIN_EMAIL}`);
  console.log(`✓ Password: ${ADMIN_PASSWORD}`);
  console.log(`  (hash token esempio: ${createHash("sha256").update("demo").digest("hex").slice(0, 16)}...)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
