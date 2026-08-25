import { staff, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { SnapshotStaff } from "@pizzaguys/types";
import { eq } from "drizzle-orm";

/**
 * Upsert operatori cloud → staff edge (stesso id utente).
 * Non elimina/disattiva operatori solo-locali: dopo import edge→cloud restano allineati.
 */
export function applyStaffFromSnapshot(db: EdgeDatabase, rows: SnapshotStaff[] | undefined) {
  if (!rows?.length) return;

  const now = new Date().toISOString();

  for (const row of rows) {
    if (!row.id || !row.pinHash) continue;
    if (!["USER_ADMIN", "CASHIER", "WAITER"].includes(row.role)) continue;

    const existing = db.select().from(staff).where(eq(staff.id, row.id)).get();
    const values = {
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
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
}
