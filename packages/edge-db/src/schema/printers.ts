import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workCenterEnum = ["CUCINA", "PIZZERIA", "BAR", "CHEF"] as const;
export type WorkCenter = (typeof workCenterEnum)[number];

export const printers = sqliteTable("printers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  workCenter: text("work_center", { enum: workCenterEnum }).notNull(),
  host: text("host").notNull().default("127.0.0.1"),
  port: integer("port").notNull().default(9100),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Stampante su cui dirottare i ticket se questa è giù (carta finita, spenta...). */
  fallbackPrinterId: text("fallback_printer_id"),
  /** MAC della stampante, imparato al primo contatto: serve a ritrovarla se cambia IP. */
  macAddress: text("mac_address"),
  createdAt: text("created_at").notNull(),
});

export const categoryRouting = sqliteTable("category_routing", {
  categoryId: text("category_id").primaryKey(),
  workCenter: text("work_center", { enum: workCenterEnum }).notNull(),
});

export const printJobStatusEnum = ["QUEUED", "PRINTED", "REROUTED", "RETRYING", "FAILED", "CANCELLED"] as const;
export type PrintJobStatus = (typeof printJobStatusEnum)[number];

/**
 * Coda di stampa (R3): ogni ticket ESC/POS viene salvato prima di essere inviato.
 * Se la stampante è giù il ticket resta in RETRYING e viene ritentato in automatico;
 * da qui la cassa può ristampare qualsiasi ticket. Conservati 7 giorni.
 */
export const printJobs = sqliteTable("print_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  tableLabel: text("table_label").notNull(),
  /** Stampante prevista (id del DB, o nome simbolico se non configurata). */
  printerId: text("printer_id").notNull(),
  printerName: text("printer_name").notNull(),
  /** Stampante che ha effettivamente stampato (diversa se dirottato). */
  printedOnId: text("printed_on_id"),
  printedOnName: text("printed_on_name"),
  label: text("label").notNull(),
  payload: blob("payload", { mode: "buffer" }).notNull(),
  status: text("status", { enum: printJobStatusEnum }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  nextAttemptAt: text("next_attempt_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  printedAt: text("printed_at"),
  /** Se è una ristampa, il ticket originale. */
  reprintOf: text("reprint_of"),
});
