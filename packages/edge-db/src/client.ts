import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export function createEdgeDb(dbPath: string) {
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
