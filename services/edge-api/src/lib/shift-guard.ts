import { randomUUID } from "node:crypto";
import { staffShifts, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { ShiftStatusPayload } from "@pizzaguys/types";
import { isNull } from "drizzle-orm";
import { broadcast } from "./ws-hub.js";

/**
 * Il locale è "in turno" se almeno un turno cassa è aperto.
 * Senza turno: niente invio comande, incassi e ordini al banco.
 */
export const SHIFT_NOT_ACTIVE = {
  error: "Turno non attivo — la cassa deve avviare il turno",
  code: "SHIFT_NOT_ACTIVE",
} as const;

export function getShiftStatus(edgeDb: EdgeDatabase): ShiftStatusPayload {
  const openShifts = edgeDb
    .select({ id: staffShifts.id })
    .from(staffShifts)
    .where(isNull(staffShifts.endedAt))
    .all().length;
  return { active: openShifts > 0, openShifts };
}

export function isShiftActive(edgeDb: EdgeDatabase): boolean {
  return getShiftStatus(edgeDb).active;
}

/** Da chiamare dopo ogni apertura/chiusura turno: palmari e cassa aggiornano l'avviso. */
export function broadcastShiftStatus(edgeDb: EdgeDatabase) {
  broadcast({
    type: "SHIFT_STATUS",
    payload: getShiftStatus(edgeDb),
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}
