import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export function createEdgeDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS edge_state (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'UNPROVISIONED',
      location_id TEXT,
      location_name TEXT,
      api_token TEXT,
      edge_device_id TEXT,
      schema_version INTEGER NOT NULL DEFAULT 0,
      last_heartbeat_at TEXT,
      shift_reminder_schedule TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_cache (
      id INTEGER PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      apply_cover_charge INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 0,
      y REAL NOT NULL DEFAULT 0,
      width REAL NOT NULL DEFAULT 80,
      height REAL NOT NULL DEFAULT 80,
      default_guests INTEGER NOT NULL DEFAULT 2,
      is_virtual INTEGER NOT NULL DEFAULT 0,
      virtual_type TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      work_center TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '127.0.0.1',
      port INTEGER NOT NULL DEFAULT 9100,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS category_routing (
      category_id TEXT PRIMARY KEY,
      work_center TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff_shifts (
      id TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      location_id TEXT,
      staff_id TEXT,
      operation TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      previous_state TEXT,
      next_state TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS closure_archive (
      id TEXT PRIMARY KEY,
      closure_date TEXT NOT NULL,
      z_number INTEGER,
      theoretical_json TEXT NOT NULL,
      declared_json TEXT NOT NULL,
      discrepancy_json TEXT NOT NULL,
      operator_staff_id TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS day_report_transactions (
      id TEXT PRIMARY KEY,
      closure_date TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_day_report_tx_date ON day_report_transactions(closure_date);
    CREATE TABLE IF NOT EXISTS day_report_stornos (
      id TEXT PRIMARY KEY,
      closure_date TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_day_report_storno_date ON day_report_stornos(closure_date);
    CREATE TABLE IF NOT EXISTS invoice_customer_profiles (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      address TEXT,
      postal_code TEXT,
      province TEXT,
      city TEXT,
      country TEXT NOT NULL DEFAULT 'IT',
      vat_number TEXT,
      tax_code TEXT,
      sdi_code TEXT,
      pec TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'CLOUD',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_customers_name ON invoice_customer_profiles(business_name);
    CREATE INDEX IF NOT EXISTS idx_invoice_customers_city ON invoice_customer_profiles(city);
    CREATE TABLE IF NOT EXISTS fiscal_documents (
      id TEXT PRIMARY KEY,
      document_number INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      closure_date TEXT NOT NULL,
      location_id TEXT NOT NULL,
      table_id TEXT,
      table_label TEXT,
      payment_method TEXT NOT NULL,
      service_type TEXT,
      total REAL NOT NULL,
      change_amount REAL,
      operator_staff_id TEXT,
      operator_name TEXT,
      shift_id TEXT,
      status TEXT NOT NULL DEFAULT 'ISSUED',
      voided_at TEXT,
      voided_by_staff_id TEXT,
      void_reason TEXT,
      invoice_id TEXT,
      invoice_number TEXT,
      customer_business_name TEXT,
      receipt_json TEXT NOT NULL,
      meta_json TEXT,
      file_json_path TEXT,
      file_txt_path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fiscal_docs_date ON fiscal_documents(closure_date);
    CREATE INDEX IF NOT EXISTS idx_fiscal_docs_issued ON fiscal_documents(issued_at);
    CREATE INDEX IF NOT EXISTS idx_fiscal_docs_type ON fiscal_documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_fiscal_docs_status ON fiscal_documents(status);
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      seq_number INTEGER NOT NULL,
      reservation_date TEXT NOT NULL,
      reservation_time TEXT NOT NULL,
      shift TEXT NOT NULL DEFAULT 'DINNER_1',
      customer_name TEXT NOT NULL,
      phone TEXT,
      guests INTEGER NOT NULL,
      table_id TEXT,
      table_label TEXT,
      room_id TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      is_waiting_list INTEGER NOT NULL DEFAULT 0,
      created_by_staff_id TEXT,
      created_by_name TEXT,
      confirmed_at TEXT,
      arrived_at TEXT,
      seated_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
    CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
  `);

  try {
    sqlite.exec(`ALTER TABLE rooms ADD COLUMN apply_cover_charge INTEGER NOT NULL DEFAULT 1`);
  } catch {
    /* colonna già presente */
  }

  try {
    sqlite.exec(`ALTER TABLE edge_state ADD COLUMN max_guest_capacity INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* colonna già presente */
  }

  try {
    sqlite.exec(`ALTER TABLE staff ADD COLUMN email TEXT`);
  } catch {
    /* colonna già presente */
  }

  try {
    sqlite.exec(`ALTER TABLE edge_state ADD COLUMN shift_reminder_schedule TEXT`);
  } catch {
    /* colonna già presente */
  }

  try {
    sqlite.exec(`ALTER TABLE edge_state DROP COLUMN shift_reminder_start`);
    sqlite.exec(`ALTER TABLE edge_state DROP COLUMN shift_reminder_end`);
  } catch {
    /* colonne non presenti (installazione nuova) o SQLite non supporta DROP COLUMN in questa versione */
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS internal_closure_archive (
      id TEXT PRIMARY KEY,
      closure_date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      operator_staff_id TEXT,
      operator_name TEXT NOT NULL,
      emailed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const row = db.select().from(schema.edgeState).get();
  if (!row) {
    db.insert(schema.edgeState)
      .values({ id: 1, status: "UNPROVISIONED", schemaVersion: 0, updatedAt: new Date().toISOString() })
      .run();
  }

  return db;
}

export type EdgeDatabase = ReturnType<typeof createEdgeDb>;

export async function getEdgeState(db: EdgeDatabase) {
  return db.select().from(schema.edgeState).where(sql`id = 1`).get();
}
