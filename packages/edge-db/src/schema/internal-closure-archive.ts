import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Storico chiusure interne (quaderno digitale) */
export const internalClosureArchive = sqliteTable("internal_closure_archive", {
  id: text("id").primaryKey(),
  closureDate: text("closure_date").notNull(),
  payloadJson: text("payload_json").notNull(),
  operatorStaffId: text("operator_staff_id"),
  operatorName: text("operator_name").notNull(),
  emailedAt: text("emailed_at"),
  createdAt: text("created_at").notNull(),
});
