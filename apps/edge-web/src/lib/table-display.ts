import type { TableStatus } from "@pizzaguys/types";

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

/** Scala la mappa per riempire il contenitore (tavoli più grandi e touch-friendly). */
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
