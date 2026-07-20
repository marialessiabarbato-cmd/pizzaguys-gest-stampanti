import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { edgeState } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { getAllTableRuntime, getTableRuntime } from "./runtime.js";

export function guestCountForTable(tableId: string): number {
  const runtime = getTableRuntime(tableId);
  return runtime.guests ?? runtime.chargedGuests ?? 0;
}

export function combinedTableCapacity(_edgeDb: EdgeDatabase, _tableIds: string[]): number {
  return 0;
}

export function effectiveCapacityForTable(_edgeDb: EdgeDatabase, _tableId: string): number {
  return 0;
}

export function validateGuestCount(
  requested: number,
  _capacity?: number,
): { ok: true; guests: number } {
  const guests = Math.max(1, Math.floor(requested));
  return { ok: true, guests };
}

export function parseGuestCount(
  requested: number | undefined,
  _capacity?: number,
): { ok: true; guests: number | undefined } | { ok: false; error: string } {
  if (requested == null) return { ok: true, guests: undefined };
  return validateGuestCount(requested);
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

export type CapacityCheckResult =
  | { ok: true; capacity: number }
  | { ok: false; error: string; capacity: number; totalGuests: number };

/** Limiti per tavolo disabilitati: sempre ok. */
export function validateTableCapacity(
  totalGuests: number,
  capacity = 0,
  _tableLabel?: string,
): CapacityCheckResult {
  return { ok: true, capacity };
}

export function validateMergeCapacity(
  _edgeDb: EdgeDatabase,
  _targetTableId: string,
  _sourceTableIds: string[],
  _totalGuests: number,
): CapacityCheckResult {
  return { ok: true, capacity: 0 };
}

export function validateTransferCapacity(
  _edgeDb: EdgeDatabase,
  _sourceTableId: string,
  _targetTableId: string,
  _totalGuests: number,
): CapacityCheckResult {
  return { ok: true, capacity: 0 };
}

export function getVenueMaxGuests(edgeDb: EdgeDatabase): number {
  const row = edgeDb.select().from(edgeState).where(eq(edgeState.id, 1)).get();
  return row?.maxGuestCapacity ?? 0;
}

export function totalActiveGuests(): number {
  return getAllTableRuntime()
    .filter((t) => !["FREE", "LOCKED"].includes(t.status))
    .reduce((sum, t) => sum + (t.guests ?? t.chargedGuests ?? 0), 0);
}

export function checkVenueCapacity(
  edgeDb: EdgeDatabase,
  additionalGuests = 0,
): { ok: true } | { ok: false; warning: string; max: number; current: number } {
  const max = getVenueMaxGuests(edgeDb);
  if (max <= 0) return { ok: true };
  const current = totalActiveGuests() + additionalGuests;
  if (current > max) {
    return {
      ok: false,
      warning: `Attenzione: ${current} coperti attivi superano la capienza sede (${max})`,
      max,
      current,
    };
  }
  return { ok: true };
}
