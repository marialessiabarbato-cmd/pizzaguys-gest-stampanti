import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const edgeState = sqliteTable("edge_state", {
  id: integer("id").primaryKey(),
  status: text("status", { enum: ["UNPROVISIONED", "ACTIVE"] }).notNull().default("UNPROVISIONED"),
  locationId: text("location_id"),
  locationName: text("location_name"),
  apiToken: text("api_token"),
  edgeDeviceId: text("edge_device_id"),
  schemaVersion: integer("schema_version").notNull().default(0),
  lastHeartbeatAt: text("last_heartbeat_at"),
  /** Capienza massima sede (0 = illimitata), sincronizzata da cloud */
  maxGuestCapacity: integer("max_guest_capacity").notNull().default(0),
  /** Calendario settimanale promemoria apertura turno (JSON array), sincronizzato da cloud */
  shiftReminderSchedule: text("shift_reminder_schedule"),
  updatedAt: text("updated_at").notNull(),
});

export const menuCache = sqliteTable("menu_cache", {
  id: integer("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
