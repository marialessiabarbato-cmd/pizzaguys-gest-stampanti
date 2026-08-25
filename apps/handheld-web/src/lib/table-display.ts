import type { TableStatus } from "@pizzaguys/types";
import { tableSeats } from "./table-seats";
import type { LiveTable } from "./types";

export const TABLE_STATUS_ACCENT: Record<TableStatus, string> = {
  FREE: "border-l-emerald-600",
  OCCUPIED: "border-l-blue-600",
  LOCKED: "border-l-rose-600",
  BILL_REQUESTED: "border-l-amber-500",
  SPLIT_IN_PROGRESS: "border-l-violet-600",
};

export const TABLE_STATUS_DOT: Record<TableStatus, string> = {
  FREE: "bg-emerald-600",
  OCCUPIED: "bg-blue-600",
  LOCKED: "bg-rose-600",
  BILL_REQUESTED: "bg-amber-500",
  SPLIT_IN_PROGRESS: "bg-violet-600",
};

export const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  FREE: "bg-emerald-600",
  OCCUPIED: "bg-blue-600",
  LOCKED: "bg-rose-600",
  BILL_REQUESTED: "bg-amber-500 animate-pulse",
  SPLIT_IN_PROGRESS: "bg-violet-600",
};

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  FREE: "Libero",
  OCCUPIED: "Occupato",
  LOCKED: "In uso cameriere",
  BILL_REQUESTED: "Conto richiesto",
  SPLIT_IN_PROGRESS: "Divisione conto",
};

/** Normalizza etichette tipo "tavolo7", "TAVOLO8", "TAVolo 5" → "Tavolo 7" */
export function formatTableLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;

  if (/^asporto$/i.test(trimmed)) return "Asporto";
  if (/^delivery$/i.test(trimmed)) return "Delivery";

  const numbered = trimmed.match(/^tavolo\s*#?\s*(\d+)$/i);
  if (numbered) return `Tavolo ${numbered[1]}`;

  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function tableLabelFontClass(label: string, width: number): string {
  const len = formatTableLabel(label).length;
  if (len > 14 || width < 72) return "text-[10px]";
  if (len > 10 || width < 96) return "text-xs";
  if (len > 7 || width < 112) return "text-sm";
  return "text-base";
}

export interface MapTableBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeMapBounds(
  tables: MapTableBounds[],
  padding = 40,
): { width: number; height: number } {
  if (tables.length === 0) return { width: 480, height: 320 };
  const maxX = Math.max(...tables.map((t) => t.x + t.width));
  const maxY = Math.max(...tables.map((t) => t.y + t.height));
  return {
    width: Math.max(360, maxX + padding),
    height: Math.max(280, maxY + padding),
  };
}

export function computeMapScale(
  content: { width: number; height: number },
  container: { width: number; height: number },
  padding = 24,
  maxScale = 5,
): number {
  if (container.width <= padding || container.height <= padding) return 1;
  const sx = (container.width - padding) / content.width;
  const sy = (container.height - padding) / content.height;
  const fit = Math.min(sx, sy);
  return Math.min(Math.max(fit, 1), maxScale);
}

export function filterTablesByRoom<T extends { isVirtual: boolean; roomId?: string | null }>(
  tables: T[],
  roomId: string | null,
  roomCount: number,
): T[] {
  const physical = tables.filter((t) => !t.isVirtual);
  if (roomCount <= 1 || !roomId) return physical;
  return physical.filter((t) => t.roomId === roomId || !t.roomId);
}

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

/** Etichetta composta per tavoli uniti, es. "Tavolo 1 + Tavolo 3" */
export function mergedTableLabel(table: LiveTable, allTables: LiveTable[]): string {
  return unionMembers(table, allTables)
    .map((t) => formatTableLabel(t.label))
    .join(" + ");
}

/** Titolo compatto in header: "Tavolo 7 + 5" */
export function compactMergedTableLabel(table: LiveTable, allTables: LiveTable[]): string {
  const members = unionMembers(table, allTables);
  if (members.length < 2) return formatTableLabel(table.label);
  return members
    .map((t, i) => (i === 0 ? formatTableLabel(t.label) : shortTableRef(t.label)))
    .join(" + ");
}

export function hostTableLabel(
  table: LiveTable,
  allTables: LiveTable[],
): string | null {
  if (!table.mergedIntoTableId) return null;
  const label = allTables.find((t) => t.id === table.mergedIntoTableId)?.label;
  return label ? formatTableLabel(label) : null;
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

export function shortTableRef(label: string): string {
  const formatted = formatTableLabel(label);
  const numbered = formatted.match(/(\d+)\s*$/);
  if (numbered) return numbered[1]!;
  return formatted.length > 6 ? `${formatted.slice(0, 6)}…` : formatted;
}

/** Tavoli visibili sulla mappa: nasconde gli annessi (conto sul host). */
export function filterMapVisibleTables<T extends { mergedIntoTableId?: string | null }>(
  tables: T[],
): T[] {
  return tables.filter((t) => !t.mergedIntoTableId);
}

/** Coperti del gruppo: parti per tavolo fisico, es. [3, 2]. */
export function unionGuestParts(table: LiveTable, allTables: LiveTable[]): number[] {
  return unionMembers(table, allTables).map((m) => m.guests ?? 0);
}

/** Totale coperti (somma tavoli del gruppo). */
export function unionGuestTotal(table: LiveTable, allTables: LiveTable[]): number {
  return unionGuestParts(table, allTables).reduce((a, b) => a + b, 0);
}

/**
 * Testo coperti per card/comanda.
 * Unione con ripartizione: "3+2 cop." — singolo: "3 cop."
 */
export function formatUnionGuests(
  table: LiveTable,
  allTables: LiveTable[],
  opts?: { suffix?: string; long?: boolean },
): string {
  const suffix = opts?.suffix ?? (opts?.long ? " coperti" : " cop.");
  const parts = unionGuestParts(table, allTables);
  const total = parts.reduce((a, b) => a + b, 0);
  if (total <= 0) return "";
  if (parts.length > 1 && parts.filter((p) => p > 0).length > 1) {
    return `${parts.join("+")}${suffix}`;
  }
  return `${total}${suffix}`;
}

/** Etichetta membro unione con coperti, es. "Tavolo 1 · 9" o compatta "1 · 9". */
export function unionMemberChipLabel(table: LiveTable, opts?: { compact?: boolean }): string {
  const label = opts?.compact ? shortTableRef(table.label) : formatTableLabel(table.label);
  const g = table.guests ?? 0;
  return g > 0 ? `${label} · ${g}` : label;
}

/**
 * Dettaglio coperti per comanda: "Tavolo 1 · 9 + Tavolo 4 · 3".
 * Se le etichette coincidono restano distinguibili dai numeri.
 */
export function formatUnionGuestsDetail(
  table: LiveTable,
  allTables: LiveTable[],
): string {
  const members = unionMembers(table, allTables);
  if (members.length < 2) {
    return formatUnionGuests(table, allTables, { long: true });
  }
  const parts = members.map((m) => {
    const g = m.guests ?? 0;
    return g > 0 ? `${formatTableLabel(m.label)} · ${g}` : formatTableLabel(m.label);
  });
  const total = unionGuestTotal(table, allTables);
  return `${parts.join(" + ")} (tot. ${total})`;
}

/** Allinea i metadati unione dal live list (activeTable può essere stale). */
export function resolveLiveTable(
  table: LiveTable,
  allTables: LiveTable[],
): LiveTable {
  return allTables.find((t) => t.id === table.id) ?? table;
}

/** Testo compatto per le card tavolo sulla mappa cameriere */
export function mapTableMeta(
  table: LiveTable,
  allTables: LiveTable[],
): { title: string; meta: string } {
  const title = formatTableLabel(table.label);
  const breakdown = formatUnionGuests(table, allTables);
  if (breakdown) {
    return { title, meta: breakdown };
  }
  // Fallback se gli annessi non sono ancora nel live list client
  if ((table.guestTotal ?? 0) > 0) {
    return { title, meta: `${table.guestTotal} cop.` };
  }
  return { title, meta: "" };
}

export function seatSummary(table: LiveTable, allTables: LiveTable[] = []): string {
  const seats = tableSeats(table);
  const guestsLabel = formatUnionGuests(table, allTables.length ? allTables : [table], {
    long: true,
  });
  if (isUnionHost(table) && seats > table.defaultGuests) {
    return guestsLabel ? `${guestsLabel} · ${seats} posti` : `${seats} posti`;
  }
  return guestsLabel;
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
