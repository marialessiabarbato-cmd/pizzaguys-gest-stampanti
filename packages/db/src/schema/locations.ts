import { boolean, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands.js";

/** Una fascia oraria in cui la Cassa ricorda di avviare il turno. `day`: 0=Domenica … 6=Sabato (Date.getDay()). */
export interface ShiftReminderWindow {
  day: number;
  start: string;
  end: string;
}

export const locationHealthEnum = pgEnum("location_health", ["ONLINE", "OFFLINE", "DESYNC"]);

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address").notNull(),
  vatNumber: text("vat_number").notNull(),
  fiscalCode: text("fiscal_code"),
  managerEmail: text("manager_email").notNull(),
  /** Invia mail di riepilogo alla chiusura giornaliera (manager + soci) */
  sendClosureEmail: boolean("send_closure_email").notNull().default(false),
  /** Email soci destinatari della mail di chiusura, separate da virgola */
  partnerEmails: text("partner_emails"),
  /** Importo coperto per persona (€), configurabile per sede */
  coverChargeAmount: real("cover_charge_amount").notNull().default(0),
  /** Capienza massima coperti sede (0 = illimitata) */
  maxGuestCapacity: integer("max_guest_capacity").notNull().default(0),
  /** Calendario settimanale (anche più fasce per giorno, es. pranzo+cena) in cui
   *  la Cassa ricorda di avviare il turno se non è stato ancora fatto. */
  shiftReminderSchedule: jsonb("shift_reminder_schedule").$type<ShiftReminderWindow[]>(),
  apiTokenHash: text("api_token_hash"),
  schemaVersion: integer("schema_version").notNull().default(1),
  healthStatus: locationHealthEnum("health_status").notNull().default("OFFLINE"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
