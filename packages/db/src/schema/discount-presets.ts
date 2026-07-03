import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";

export const locationDiscountPresets = pgTable("location_discount_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  percent: integer("percent").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
