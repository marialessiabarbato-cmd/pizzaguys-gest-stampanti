import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands.js";

export const brandSettings = pgTable("brand_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" })
    .unique(),
  maxDiscountPercent: integer("max_discount_percent").notNull().default(20),
  tableLockTimeoutMinutes: integer("table_lock_timeout_minutes").notNull().default(15),
  sdiEnabled: integer("sdi_enabled").notNull().default(0),
  deliveryBrokers: jsonb("delivery_brokers").$type<string[]>().notNull().default([]),
  schemaVersion: integer("schema_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
