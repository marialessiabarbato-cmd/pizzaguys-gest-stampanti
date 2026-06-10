import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands.js";
import { locations } from "./locations.js";

export const salesChannelEnum = pgEnum("sales_channel", ["TABLE", "TAKEAWAY", "DELIVERY"]);
export const variantTypeEnum = pgEnum("variant_type", ["ADD", "REMOVE"]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: jsonb("name").$type<Record<string, string>>().notNull(),
  description: jsonb("description").$type<Record<string, string>>(),
  colorHex: text("color_hex").notNull(),
  defaultVatRate: integer("default_vat_rate").notNull(),
  hold: boolean("hold").notNull().default(false),
  dessert: boolean("dessert").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: jsonb("name").$type<Record<string, string>>().notNull(),
  description: jsonb("description").$type<Record<string, string>>(),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  hold: boolean("hold").notNull().default(false),
  dessert: boolean("dessert").notNull().default(false),
  allergenIds: jsonb("allergen_ids").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const variantGroups = pgTable("variant_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: jsonb("name").$type<Record<string, string>>().notNull(),
  categoryIds: jsonb("category_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const variants = pgTable("variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => variantGroups.id, { onDelete: "cascade" }),
  name: jsonb("name").$type<Record<string, string>>().notNull(),
  type: variantTypeEnum("type").notNull(),
  priceDelta: numeric("price_delta", { precision: 10, scale: 2 }).notNull(),
});

export const productPrices = pgTable("product_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  channel: salesChannelEnum("channel").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }),
});
