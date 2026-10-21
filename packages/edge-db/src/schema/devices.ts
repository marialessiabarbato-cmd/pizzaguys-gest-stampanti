import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Device abbinati all'Edge (palmari, KDS, tablet cassa). L'abbinamento avviene una volta
 * con il PIN di un operatore; poi il device si presenta con il suo token (salvato solo come hash).
 */
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  tokenHash: text("token_hash").notNull(),
  pairedAt: text("paired_at").notNull(),
  pairedByStaffId: text("paired_by_staff_id"),
  pairedByName: text("paired_by_name"),
  lastSeenAt: text("last_seen_at"),
  lastIp: text("last_ip"),
  clientVersion: text("client_version"),
  revokedAt: text("revoked_at"),
});
