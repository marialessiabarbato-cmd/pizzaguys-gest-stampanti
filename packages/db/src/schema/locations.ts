import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands.js";

export const locationHealthEnum = pgEnum("location_health", ["ONLINE", "OFFLINE", "DESYNC"]);

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull(),
  vatNumber: text("vat_number").notNull(),
  fiscalCode: text("fiscal_code"),
  managerEmail: text("manager_email").notNull(),
  apiTokenHash: text("api_token_hash"),
  schemaVersion: integer("schema_version").notNull().default(1),
  healthStatus: locationHealthEnum("health_status").notNull().default("OFFLINE"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
