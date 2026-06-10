import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";
import { users } from "./users.js";

export const auditSeverityEnum = pgEnum("audit_severity", ["INFO", "WARNING", "CRITICAL"]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  operation: text("operation").notNull(),
  severity: auditSeverityEnum("severity").notNull().default("INFO"),
  previousState: jsonb("previous_state"),
  nextState: jsonb("next_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
