import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const invoiceCustomerProfiles = sqliteTable("invoice_customer_profiles", {
  id: text("id").primaryKey(),
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
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  source: text("source", { enum: ["CLOUD", "LOCAL"] }).notNull().default("CLOUD"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
