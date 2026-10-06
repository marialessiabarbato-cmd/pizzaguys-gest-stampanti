import type { LiveTable } from "./types";

const OCCUPIED = new Set(["OCCUPIED", "LOCKED", "BILL_REQUESTED"]);

export function guestsAt(table: LiveTable): number {
  if (table.guests != null && table.guests > 0) return table.guests;
  if (table.status !== "FREE") return table.defaultGuests ?? 0;
  return 0;
}

export function tableSeats(table: LiveTable): number {
  return table.tableCapacity ?? table.defaultGuests ?? 0;
}

export function combinedSeats(tableIds: string[], allTables: LiveTable[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const id of tableIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const t = allTables.find((x) => x.id === id);
    if (t) total += tableSeats(t);
  }
  return total;
}

export function projectedGuests(ids: string[], allTables: LiveTable[]): number {
  let total = 0;
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const t = allTables.find((x) => x.id === id);
    if (t) total += guestsAt(t);
  }
  return total;
}

export function mergePartnerPool(
  primary: LiveTable,
  allTables: LiveTable[],
): LiveTable[] {
  return allTables
    .filter(
      (t) =>
        !t.isVirtual &&
        t.id !== primary.id &&
        t.status !== "SPLIT_IN_PROGRESS" &&
        t.status !== "BILL_REQUESTED",
    )
    .sort((a, b) => {
      const aOcc = OCCUPIED.has(a.status) ? 0 : 1;
      const bOcc = OCCUPIED.has(b.status) ? 0 : 1;
      if (aOcc !== bOcc) return aOcc - bOcc;
      if (primary.roomId) {
        const aRoom = a.roomId === primary.roomId ? 0 : 1;
        const bRoom = b.roomId === primary.roomId ? 0 : 1;
        if (aRoom !== bRoom) return aRoom - bRoom;
      }
      return String(a.label ?? "").localeCompare(String(b.label ?? ""), "it", {
        numeric: true,
      });
    });
}
