import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.js";

export const dailyClosures = pgTable(
  "daily_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    closureDate: text("closure_date").notNull(),
    fiscalZNumber: integer("fiscal_z_number"),
    gross: numeric("gross", { precision: 12, scale: 2 }).notNull(),
    cashDeclared: numeric("cash_declared", { precision: 12, scale: 2 }).notNull(),
    posDeclared: numeric("pos_declared", { precision: 12, scale: 2 }).notNull(),
    discrepancy: numeric("discrepancy", { precision: 12, scale: 2 }).notNull(),
    byChannel: jsonb("by_channel").$type<Record<string, number>>().notNull().default({}),
    byPaymentMethod: jsonb("by_payment_method").$type<Record<string, number>>().notNull().default({}),
    receipts: jsonb("receipts").$type<unknown[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_closures_location_date_idx").on(table.locationId, table.closureDate),
  ],
);
