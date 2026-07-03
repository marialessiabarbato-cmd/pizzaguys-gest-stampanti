import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands.js";

export const invoiceCustomerProfiles = pgTable("invoice_customer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  address: text("address"),
  postalCode: text("postal_code"),
  province: text("province"),
  city: text("city"),
  country: text("country").notNull().default("IT"),
  vatNumber: text("vat_number"),
  taxCode: text("tax_code"),
  sdiCode: text("sdi_code"),
  pec: text("pec"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
