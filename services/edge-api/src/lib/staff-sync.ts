import { staff, syncQueue, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { SnapshotStaff } from "@pizzaguys/types";
import { and, eq } from "drizzle-orm";

/**
 * Upsert operatori cloud → staff edge (stesso id utente).
 * Il Cloud è l'anagrafica di riferimento: un operatore attivo sull'Edge che il Cloud non
 * elenca più (eliminato da Cloud Admin) viene disattivato, così il suo PIN smette di
 * funzionare. Restano attivi gli operatori creati sull'Edge e non ancora sincronizzati.
 */
export function applyStaffFromSnapshot(db: EdgeDatabase, rows: SnapshotStaff[] | undefined) {
  if (!rows) return;

  const now = new Date().toISOString();

  for (const row of rows) {
    if (!row.id || !row.pinHash) continue;
    if (!["USER_ADMIN", "CASHIER", "WAITER"].includes(row.role)) continue;

    const existing = db.select().from(staff).where(eq(staff.id, row.id)).get();
    const values = {
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      ...(row.email ? { email: row.email } : {}),
      pinHash: row.pinHash,
      isActive: row.isActive ?? true,
      updatedAt: now,
    };

    if (existing) {
      db.update(staff).set(values).where(eq(staff.id, row.id)).run();
    } else {
      db.insert(staff)
        .values({
          id: row.id,
          ...values,
          createdAt: now,
        })
        .run();
    }
  }

  const cloudIds = new Set(rows.map((row) => row.id));
  const pendingIds = new Set(
    db
      .select({ payload: syncQueue.payload })
      .from(syncQueue)
      .where(and(eq(syncQueue.operation, "STAFF_SYNC"), eq(syncQueue.status, "PENDING")))
      .all()
      .map((item) => (JSON.parse(item.payload) as { id: string }).id),
  );
  const active = db.select({ id: staff.id }).from(staff).where(eq(staff.isActive, true)).all();
  for (const member of active) {
    if (cloudIds.has(member.id) || pendingIds.has(member.id)) continue;
    db.update(staff).set({ isActive: false, updatedAt: now }).where(eq(staff.id, member.id)).run();
  }
}
