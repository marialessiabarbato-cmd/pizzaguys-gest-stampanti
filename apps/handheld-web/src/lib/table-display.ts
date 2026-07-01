import { tableSeats } from "./table-seats";
import type { LiveTable } from "./types";

/** Tavoli nel gruppo (host + annessi), in ordine host prima */
export function unionMembers(table: LiveTable, allTables: LiveTable[]): LiveTable[] {
  if (!table.linkedTableIds?.length) return [table];
  const members = [table];
  for (const id of table.linkedTableIds) {
    const linked = allTables.find((t) => t.id === id);
    if (linked) members.push(linked);
  }
  return members;
}

/** Etichetta composta per tavoli uniti, es. "T1+T3" */
export function mergedTableLabel(table: LiveTable, allTables: LiveTable[]): string {
  return unionMembers(table, allTables)
    .map((t) => t.label)
    .join("+");
}

export function hostTableLabel(
  table: LiveTable,
  allTables: LiveTable[],
): string | null {
  if (!table.mergedIntoTableId) return null;
  return allTables.find((t) => t.id === table.mergedIntoTableId)?.label ?? null;
}

export function hostTable(
  table: LiveTable,
  allTables: LiveTable[],
): LiveTable | null {
  if (!table.mergedIntoTableId) return null;
  return allTables.find((t) => t.id === table.mergedIntoTableId) ?? null;
}

export function isUnionHost(table: LiveTable): boolean {
  return (table.linkedTableIds?.length ?? 0) > 0;
}

export function isMergedAway(table: LiveTable): boolean {
  return !!table.mergedIntoTableId;
}

export function seatSummary(table: LiveTable): string {
  const seats = tableSeats(table);
  const guests = table.guests ?? 0;
  if (isUnionHost(table) && seats > table.defaultGuests) {
    return guests > 0 ? `${guests} cop. · ${seats} posti` : `${seats} posti`;
  }
  if (guests > 0) return `${guests} coperti`;
  return "";
}

export function tableCenter(t: LiveTable): { x: number; y: number } {
  return { x: t.x + t.width / 2, y: t.y + t.height / 2 };
}

export type UnionLink = {
  host: LiveTable;
  child: LiveTable;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function unionLinks(allTables: LiveTable[]): UnionLink[] {
  const links: UnionLink[] = [];
  for (const child of allTables) {
    if (!child.mergedIntoTableId) continue;
    const host = allTables.find((t) => t.id === child.mergedIntoTableId);
    if (!host) continue;
    const c1 = tableCenter(host);
    const c2 = tableCenter(child);
    links.push({ host, child, x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y });
  }
  return links;
}
