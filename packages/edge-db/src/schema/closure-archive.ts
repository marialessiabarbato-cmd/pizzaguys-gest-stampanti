import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const closureArchive = sqliteTable("closure_archive", {
  id: text("id").primaryKey(),
  closureDate: text("closure_date").notNull(),
  zNumber: integer("z_number"),
  theoreticalJson: text("theoretical_json").notNull(),
  declaredJson: text("declared_json").notNull(),
  discrepancyJson: text("discrepancy_json").notNull(),
  operatorStaffId: text("operator_staff_id"),
  syncedAt: text("synced_at"),
  createdAt: text("created_at").notNull(),
});
