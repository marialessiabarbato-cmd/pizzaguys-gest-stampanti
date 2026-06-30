import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dayReportTransactions = sqliteTable("day_report_transactions", {
  id: text("id").primaryKey(),
  closureDate: text("closure_date").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

export const dayReportStornos = sqliteTable("day_report_stornos", {
  id: text("id").primaryKey(),
  closureDate: text("closure_date").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});
