import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";

/**
 * Sessione di cassa (pranzo o cena) chiusa in sede e sincronizzata dall'Edge.
 * La chiave è l'id generato dall'Edge: un reinvio aggiorna senza duplicare.
 */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    businessDate: text("business_date").notNull(),
    service: text("service").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    openedByName: text("opened_by_name").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByName: text("closed_by_name"),
    openingFund: numeric("opening_fund", { precision: 12, scale: 2 }).notNull(),
    countedCash: numeric("counted_cash", { precision: 12, scale: 2 }),
    posDeclared: numeric("pos_declared", { precision: 12, scale: 2 }),
    closingFundLeft: numeric("closing_fund_left", { precision: 12, scale: 2 }),
    expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }),
    totalSales: numeric("total_sales", { precision: 12, scale: 2 }),
    withdrawals: numeric("withdrawals", { precision: 12, scale: 2 }),
    expenses: numeric("expenses", { precision: 12, scale: 2 }),
    discrepancyCash: numeric("discrepancy_cash", { precision: 12, scale: 2 }),
    discrepancyPos: numeric("discrepancy_pos", { precision: 12, scale: 2 }),
    notes: text("notes"),
    theoretical: jsonb("theoretical").$type<Record<string, unknown>>().notNull().default({}),
    movements: jsonb("movements").$type<unknown[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("cash_sessions_location_date_idx").on(table.locationId, table.businessDate)],
);
