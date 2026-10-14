import { Button } from "@pizzaguys/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  TABLE_STATUS_DOT,
  TABLE_STATUS_LABELS,
  formatTableLabel,
  mapTableMeta,
  moveItem,
  sortTablesSequential,
} from "@pizzaguys/comanda";
import type { LiveTable } from "../lib/types";

/** Lista dei tavoli in ordine sequenziale: una riga per tavolo, tocco per aprirlo. */
export function TableList({
  tables,
  allTables,
  lockPending,
  onSelectTable,
  empty,
}: {
  tables: LiveTable[];
  allTables: LiveTable[];
  lockPending: string | null;
  onSelectTable: (t: LiveTable) => void;
  empty: ReactNode;
}) {
  if (tables.length === 0) return <>{empty}</>;
  return (
    <ul className="space-y-2 pb-2">
      {tables.map((table) => {
        const { title, meta } = mapTableMeta(table, allTables);
        const annexed = table.linkedTableIds?.length ?? 0;
        return (
          <li key={table.id}>
            <button
              type="button"
              disabled={lockPending === table.id}
              onClick={() => onSelectTable(table)}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-card))] px-4 py-2 text-left shadow-sm transition active:scale-[0.99] ${
                lockPending === table.id ? "opacity-50" : ""
              }`}
            >
              <span className={`h-3 w-3 shrink-0 rounded-full ${TABLE_STATUS_DOT[table.status] ?? "bg-gray-500"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold leading-tight">
                  {title}
                  {annexed > 0 && (
                    <span className="ml-2 rounded-full bg-[hsl(var(--pg-primary))] px-1.5 py-0.5 align-middle text-2xs font-bold text-[hsl(var(--pg-primary-foreground))]">
                      +{annexed}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-[hsl(var(--pg-muted-foreground))]">
                  {TABLE_STATUS_LABELS[table.status]}
                  {table.status === "LOCKED" && table.lockedByName ? ` · ${table.lockedByName}` : ""}
                </span>
              </span>
              {meta && <span className="shrink-0 text-sm font-medium tabular-nums">{meta}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const AUTO_SCROLL_EDGE = 64;
const AUTO_SCROLL_STEP = 10;

/**
 * Riordino dei tavoli di una sala: trascina la maniglia (touch o mouse) oppure usa le frecce.
 * L'ordine si salva solo con "Salva ordine".
 */
export function TableReorderList({
  tables,
  onSave,
  onCancel,
}: {
  tables: LiveTable[];
  onSave: (orderedIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(() => sortTablesSequential(tables));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<{ index: number; offset: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dragRef = useRef<{
    index: number;
    pointerId: number;
    startY: number;
    startScroll: number;
    lastY: number;
    rowHeight: number;
    frame: number;
  } | null>(null);

  const scroller = () => listRef.current?.closest<HTMLElement>("[data-scroll-container]") ?? null;

  const targetIndex = (index: number, offset: number, rowHeight: number) =>
    Math.max(0, Math.min(items.length - 1, index + Math.round(offset / rowHeight)));

  const currentOffset = () => {
    const d = dragRef.current;
    if (!d) return 0;
    return d.lastY - d.startY + ((scroller()?.scrollTop ?? 0) - d.startScroll);
  };

  // Scorrimento automatico quando il dito resta vicino al bordo della lista.
  const autoScroll = () => {
    const d = dragRef.current;
    const el = scroller();
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    let delta = 0;
    if (d.lastY < rect.top + AUTO_SCROLL_EDGE) delta = -AUTO_SCROLL_STEP;
    else if (d.lastY > rect.bottom - AUTO_SCROLL_EDGE) delta = AUTO_SCROLL_STEP;
    if (delta !== 0) {
      el.scrollTop += delta;
      setDrag({ index: d.index, offset: currentOffset() });
    }
    d.frame = requestAnimationFrame(autoScroll);
  };

  useEffect(() => () => {
    if (dragRef.current) cancelAnimationFrame(dragRef.current.frame);
  }, []);

  const onPointerDown = (index: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (saving) return;
    e.preventDefault();
    try {
      // Continua a ricevere i movimenti anche quando il dito esce dalla maniglia.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntatore non catturabile (es. già rilasciato): il trascinamento funziona comunque */
    }
    const row = e.currentTarget.closest("li");
    const gap = 8;
    dragRef.current = {
      index,
      pointerId: e.pointerId,
      startY: e.clientY,
      startScroll: scroller()?.scrollTop ?? 0,
      lastY: e.clientY,
      rowHeight: (row?.getBoundingClientRect().height ?? 56) + gap,
      frame: 0,
    };
    dragRef.current.frame = requestAnimationFrame(autoScroll);
    setDrag({ index, offset: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.lastY = e.clientY;
    setDrag({ index: d.index, offset: currentOffset() });
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    cancelAnimationFrame(d.frame);
    d.lastY = e.clientY;
    if (commit) {
      const to = targetIndex(d.index, currentOffset(), d.rowHeight);
      setItems((prev) => moveItem(prev, d.index, to));
    }
    dragRef.current = null;
    setDrag(null);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(items.map((t) => t.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio ordine");
      setSaving(false);
    }
  };

  const rowHeight = dragRef.current?.rowHeight ?? 64;
  const target = drag ? targetIndex(drag.index, drag.offset, rowHeight) : -1;

  const shiftFor = (index: number) => {
    if (!drag || index === drag.index) return 0;
    if (drag.index < index && index <= target) return -rowHeight;
    if (target <= index && index < drag.index) return rowHeight;
    return 0;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
        Trascina ≡ per spostare un tavolo, oppure usa le frecce. L'ordine vale per tutti i palmari.
      </p>
      {error && <p className="mb-2 rounded bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto">
        <ul ref={listRef} className="space-y-2 pb-2">
          {items.map((table, index) => {
            const dragging = drag?.index === index;
            return (
              <li
                key={table.id}
                style={{
                  transform: `translateY(${dragging ? drag.offset : shiftFor(index)}px)`,
                  transition: dragging || !drag ? "none" : "transform 150ms ease",
                  zIndex: dragging ? 10 : undefined,
                }}
                className={`relative flex min-h-[56px] items-center gap-2 rounded-xl border bg-[hsl(var(--pg-card))] pl-1 pr-2 ${
                  dragging
                    ? "border-[hsl(var(--pg-primary))] shadow-lg"
                    : "border-[hsl(var(--pg-border))] shadow-sm"
                }`}
              >
                <span
                  role="button"
                  aria-label={`Trascina ${formatTableLabel(table.label)}`}
                  onPointerDown={onPointerDown(index)}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => endDrag(e, true)}
                  onPointerCancel={(e) => endDrag(e, false)}
                  className="flex h-12 w-12 shrink-0 cursor-grab touch-none select-none items-center justify-center text-2xl text-[hsl(var(--pg-muted-foreground))] active:cursor-grabbing"
                >
                  ≡
                </span>
                <span className="w-7 shrink-0 text-right text-xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-bold">{formatTableLabel(table.label)}</span>
                <button
                  type="button"
                  aria-label="Sposta su"
                  disabled={index === 0 || saving}
                  onClick={() => setItems((prev) => moveItem(prev, index, index - 1))}
                  className="h-11 w-11 shrink-0 rounded-lg text-lg disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Sposta giù"
                  disabled={index === items.length - 1 || saving}
                  onClick={() => setItems((prev) => moveItem(prev, index, index + 1))}
                  className="h-11 w-11 shrink-0 rounded-lg text-lg disabled:opacity-30"
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex gap-2 border-t border-[hsl(var(--pg-border))] py-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3 text-sm"
          disabled={saving}
          onClick={() => setItems((prev) => sortTablesSequential(prev.map((t) => ({ ...t, sortOrder: 0 }))))}
        >
          Per nome
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="outline" className="h-11 px-4 text-sm" disabled={saving} onClick={onCancel}>
          Annulla
        </Button>
        <Button type="button" className="h-11 px-4 text-sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Salvo…" : "Salva"}
        </Button>
      </div>
    </div>
  );
}
