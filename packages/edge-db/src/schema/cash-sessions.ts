import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cashServiceEnum = ["LUNCH", "DINNER"] as const;
export const cashSessionStatusEnum = ["OPEN", "CLOSED"] as const;
export const cashMovementTypeEnum = ["WITHDRAWAL", "DEPOSIT", "EXPENSE"] as const;

/**
 * Sessione di cassa di un servizio (pranzo o cena): fondo iniziale, incassi, movimenti e
 * conteggio finale. Il locale è operativo solo con una sessione OPEN.
 */
export const cashSessions = sqliteTable("cash_sessions", {
  id: text("id").primaryKey(),
  businessDate: text("business_date").notNull(),
  service: text("service", { enum: cashServiceEnum }).notNull(),
  status: text("status", { enum: cashSessionStatusEnum }).notNull().default("OPEN"),
  openedByStaffId: text("opened_by_staff_id").notNull(),
  openedByName: text("opened_by_name").notNull(),
  openedAt: text("opened_at").notNull(),
  openingFund: real("opening_fund").notNull(),
  openingFundBreakdown: text("opening_fund_breakdown"),
  closedByStaffId: text("closed_by_staff_id"),
  closedByName: text("closed_by_name"),
  closedAt: text("closed_at"),
  countedCash: real("counted_cash"),
  countedCashBreakdown: text("counted_cash_breakdown"),
  posDeclared: real("pos_declared"),
  closingFundLeft: real("closing_fund_left"),
  theoreticalJson: text("theoretical_json"),
  discrepancyCash: real("discrepancy_cash"),
  discrepancyPos: real("discrepancy_pos"),
  notes: text("notes"),
  reportPath: text("report_path"),
  syncedAt: text("synced_at"),
});

export const cashMovements = sqliteTable("cash_movements", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => cashSessions.id, { onDelete: "cascade" }),
  type: text("type", { enum: cashMovementTypeEnum }).notNull(),
  amount: real("amount").notNull(),
  reason: text("reason"),
  staffId: text("staff_id").notNull(),
  staffName: text("staff_name").notNull(),
  createdAt: text("created_at").notNull(),
});
