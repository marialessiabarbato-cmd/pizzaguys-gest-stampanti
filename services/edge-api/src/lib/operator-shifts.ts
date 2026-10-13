import { randomUUID } from "node:crypto";
import { staff, staffShifts, type EdgeDatabase } from "@pizzaguys/edge-db";
import { isCashOperatorRole } from "@pizzaguys/types";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * Turno operatore = presenza di una persona (cameriere, cassiere, admin).
 * Non sblocca il locale: quello dipende solo dalla sessione di cassa.
 */
export interface OperatorShift {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  startedAt: string;
  endedAt: string | null;
}

export function listOpenOperatorShifts(db: EdgeDatabase): OperatorShift[] {
  return db
    .select({
      id: staffShifts.id,
      staffId: staffShifts.staffId,
      startedAt: staffShifts.startedAt,
      endedAt: staffShifts.endedAt,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
    })
    .from(staffShifts)
    .innerJoin(staff, eq(staff.id, staffShifts.staffId))
    .where(isNull(staffShifts.endedAt))
    .orderBy(desc(staffShifts.startedAt))
    .all()
    .map((r) => ({
      id: r.id,
      staffId: r.staffId,
      staffName: `${r.firstName} ${r.lastName}`.trim(),
      role: r.role,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    }));
}

/** Avvia il turno dell'operatore; se ne ha già uno aperto restituisce quello. */
export function startOperatorShift(db: EdgeDatabase, staffId: string) {
  const existing = db
    .select()
    .from(staffShifts)
    .where(and(eq(staffShifts.staffId, staffId), isNull(staffShifts.endedAt)))
    .get();
  if (existing) return { shift: existing, created: false };
  const row = { id: randomUUID(), staffId, startedAt: new Date().toISOString(), endedAt: null };
  db.insert(staffShifts).values(row).run();
  return { shift: row, created: true };
}

/** Chiude un turno: lo può fare l'operatore stesso o l'operatore cassa. */
export function endOperatorShift(
  db: EdgeDatabase,
  shiftId: string,
  requester: { id: string; role: string },
):
  | { ok: true; shift: typeof staffShifts.$inferSelect }
  | { ok: false; status: number; error: string } {
  const shift = db.select().from(staffShifts).where(eq(staffShifts.id, shiftId)).get();
  if (!shift) return { ok: false, status: 404, error: "Turno non trovato" };
  if (shift.endedAt) return { ok: false, status: 409, error: "Turno già chiuso" };
  if (shift.staffId !== requester.id && !isCashOperatorRole(requester.role)) {
    return {
      ok: false,
      status: 403,
      error: "Solo l'operatore stesso o l'operatore cassa può chiudere questo turno",
    };
  }
  const updated = db
    .update(staffShifts)
    .set({ endedAt: new Date().toISOString() })
    .where(eq(staffShifts.id, shiftId))
    .returning()
    .get();
  return { ok: true, shift: updated! };
}

/** A fine giornata (D6) chiude tutti i turni operatore rimasti aperti. */
export function endAllOperatorShifts(db: EdgeDatabase): number {
  const now = new Date().toISOString();
  const closed = db
    .update(staffShifts)
    .set({ endedAt: now })
    .where(isNull(staffShifts.endedAt))
    .returning()
    .all();
  return closed.length;
}
