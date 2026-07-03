import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.js";

export const electronicInvoices = pgTable(
  "electronic_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    edgeInvoiceId: text("edge_invoice_id").notNull(),
    receiptId: text("receipt_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    businessName: text("business_name").notNull(),
    customerVatNumber: text("customer_vat_number"),
    customerTaxCode: text("customer_tax_code"),
    customerSdiCode: text("customer_sdi_code"),
    customerPec: text("customer_pec"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    tableLabel: text("table_label"),
    status: text("status", { enum: ["PENDING_SEND", "SENT_TO_SDI", "REJECTED"] })
      .notNull()
      .default("PENDING_SEND"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    sdiSentAt: timestamp("sdi_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("electronic_invoices_edge_id_idx").on(table.edgeInvoiceId)],
);
