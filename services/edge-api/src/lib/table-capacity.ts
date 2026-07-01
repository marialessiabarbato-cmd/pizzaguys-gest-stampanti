import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { tables } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { getTableCapacity, getTableRuntime } from "./runtime.js";

export function guestCountForTable(tableId: string): number {
  const runtime = getTableRuntime(tableId);
  return runtime.guests ?? runtime.chargedGuests ?? 0;
}

export function combinedTableCapacity(edgeDb: EdgeDatabase, tableIds: string[]): number {
  let total = 0;
  const seen = new Set<string>();
  for (const id of tableIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = edgeDb.select().from(tables).where(eq(tables.id, id)).get();
    total += row?.defaultGuests ?? 0;
  }
  return total;
}

export function effectiveCapacityForTable(edgeDb: EdgeDatabase, tableId: string): number {
  const row = edgeDb.select().from(tables).where(eq(tables.id, tableId)).get();
  return getTableCapacity(tableId, row?.defaultGuests ?? 0);
}

export function validateGuestCount(
  requested: number,
  capacity: number,
): { ok: true; guests: number } | { ok: false; error: string } {
  const guests = Math.max(1, Math.floor(requested));
  if (capacity > 0 && guests > capacity) {
    return {
      ok: false,
      error: `Massimo ${capacity} coperti per questo tavolo`,
    };
  }
  return { ok: true, guests };
}

export function parseGuestCount(
  requested: number | undefined,
  capacity: number,
): { ok: true; guests: number | undefined } | { ok: false; error: string } {
  if (requested == null) return { ok: true, guests: undefined };
  return validateGuestCount(requested, capacity);
}

export function projectedGuestsAfterMerge(
  targetTableId: string,
  sourceTableIds: string[],
  _edgeDb: EdgeDatabase,
): number {
  const ids = [...new Set([...sourceTableIds, targetTableId])];
  let total = 0;
  for (const id of ids) {
    total += guestCountForTable(id);
  }
  return total;
}

export function projectedGuestsAfterTransfer(
  sourceTableId: string,
  targetTableId: string,
  _edgeDb: EdgeDatabase,
): number {
  return guestCountForTable(targetTableId) + guestCountForTable(sourceTableId);
}

export function validateTableCapacity(
  totalGuests: number,
  capacity: number,
  tableLabel?: string,
): { ok: true; capacity: number } | { ok: false; error: string; capacity: number; totalGuests: number } {
  if (capacity <= 0) return { ok: true, capacity };
  if (totalGuests > capacity) {
    const label = tableLabel ? `Tavolo ${tableLabel}: ` : "";
    return {
      ok: false,
      error: `${label}${totalGuests} coperti superano la capienza (${capacity} posti)`,
      capacity,
      totalGuests,
    };
  }
  return { ok: true, capacity };
}

export function validateMergeCapacity(
  edgeDb: EdgeDatabase,
  targetTableId: string,
  sourceTableIds: string[],
  totalGuests: number,
): ReturnType<typeof validateTableCapacity> {
  const targetRow = edgeDb.select().from(tables).where(eq(tables.id, targetTableId)).get();
  const involved = [...new Set([...sourceTableIds, targetTableId])];
  const capacity = Math.max(
    combinedTableCapacity(edgeDb, involved),
    effectiveCapacityForTable(edgeDb, targetTableId),
  );
  return validateTableCapacity(totalGuests, capacity, targetRow?.label);
}

export function validateTransferCapacity(
  edgeDb: EdgeDatabase,
  sourceTableId: string,
  targetTableId: string,
  totalGuests: number,
): ReturnType<typeof validateTableCapacity> {
  const targetRow = edgeDb.select().from(tables).where(eq(tables.id, targetTableId)).get();
  const capacity = effectiveCapacityForTable(edgeDb, targetTableId);
  return validateTableCapacity(totalGuests, capacity, targetRow?.label);
}
