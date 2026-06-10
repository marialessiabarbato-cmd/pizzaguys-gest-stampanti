import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  locationId: text("location_id"),
  staffId: text("staff_id"),
  operation: text("operation").notNull(),
  severity: text("severity", { enum: ["INFO", "WARNING", "CRITICAL"] })
    .notNull()
    .default("INFO"),
  previousState: text("previous_state"),
  nextState: text("next_state"),
  createdAt: text("created_at").notNull(),
});
