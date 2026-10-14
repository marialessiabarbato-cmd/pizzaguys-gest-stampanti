/**
 * Ordine e posizionamento dei tavoli (puro, senza React): condiviso da cassa e palmare.
 */

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Area di base della sala nell'editor (coordinate logiche, come lo Stage storico 900×520). */
export const SALA_AREA = { width: 900, height: 520 } as const;

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

/** Confronto naturale delle etichette: "T2" prima di "T10", "Tavolo 9" prima di "Tavolo 10". */
export function compareTableLabels(a: string, b: string): number {
  return collator.compare(a.trim(), b.trim());
}

/**
 * Ordine sequenziale della sala: prima l'ordine personalizzato (sortOrder > 0, impostato
 * trascinando dal palmare), poi i tavoli senza ordine in ordine naturale per etichetta.
 */
export function sortTablesSequential<T extends { label: string; sortOrder?: number | null }>(
  tables: T[],
): T[] {
  return [...tables].sort((a, b) => {
    const sa = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Number.POSITIVE_INFINITY;
    const sb = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return compareTableLabels(a.label, b.label);
  });
}

/** Sposta un elemento da `from` a `to` (indici nella lista), senza mutare l'originale. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

/** True se il tavolo esce (anche in parte) dall'area della sala. */
export function isOutsideArea(
  t: LayoutRect,
  area: { width: number; height: number } = SALA_AREA,
): boolean {
  return t.x < 0 || t.y < 0 || t.x + t.width > area.width || t.y + t.height > area.height;
}

/** Riporta la posizione dentro l'area (il tavolo resta intero e visibile). */
export function clampToArea(
  t: LayoutRect,
  area: { width: number; height: number } = SALA_AREA,
): { x: number; y: number } {
  const maxX = Math.max(0, area.width - t.width);
  const maxY = Math.max(0, area.height - t.height);
  return {
    x: Math.round(Math.min(Math.max(t.x, 0), maxX)),
    y: Math.round(Math.min(Math.max(t.y, 0), maxY)),
  };
}

function overlaps(a: LayoutRect, b: LayoutRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * Primo posto libero nell'area (griglia per righe dall'alto) per un tavolo di `size`.
 * Se la sala è piena restituisce comunque una posizione dentro l'area, sfalsata,
 * così il nuovo tavolo resta visibile e trascinabile.
 */
export function findFreeSlot(
  occupied: LayoutRect[],
  size: { width: number; height: number },
  area: { width: number; height: number } = SALA_AREA,
  gap = 16,
): { x: number; y: number } {
  const margin = 20;
  const stepX = size.width + gap;
  const stepY = size.height + gap;
  for (let y = margin; y + size.height <= area.height; y += stepY) {
    for (let x = margin; x + size.width <= area.width; x += stepX) {
      const candidate = { x, y, ...size };
      if (!occupied.some((o) => overlaps(candidate, o, gap / 2))) return { x, y };
    }
  }
  const n = occupied.length % 10;
  return clampToArea({ x: margin + n * 12, y: margin + n * 12, ...size }, area);
}

/**
 * Nuove posizioni per i tavoli fuori area: ognuno va nel primo posto libero,
 * tenendo conto dei tavoli già dentro e di quelli appena sistemati.
 */
export function relocateOutsideTables<T extends LayoutRect & { id: string }>(
  tables: T[],
  area: { width: number; height: number } = SALA_AREA,
): Array<{ id: string; x: number; y: number }> {
  const occupied: LayoutRect[] = tables.filter((t) => !isOutsideArea(t, area));
  const moves: Array<{ id: string; x: number; y: number }> = [];
  for (const t of tables) {
    if (!isOutsideArea(t, area)) continue;
    const slot = findFreeSlot(occupied, { width: t.width, height: t.height }, area);
    occupied.push({ ...slot, width: t.width, height: t.height });
    moves.push({ id: t.id, ...slot });
  }
  return moves;
}
