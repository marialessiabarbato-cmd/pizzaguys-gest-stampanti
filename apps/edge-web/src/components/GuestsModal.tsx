import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { formatTableLabel } from "../lib/table-display";

export type GuestsConfirmPayload = {
  guests: number;
  mergeTableIds: string[];
};

export interface GuestsModalTable {
  id: string;
  label: string;
  status: string;
  isVirtual: boolean;
  roomId?: string | null;
  guests?: number;
  defaultGuests?: number;
  tableCapacity?: number;
}

const OCCUPIED = new Set(["OCCUPIED", "LOCKED", "BILL_REQUESTED"]);

function guestsAt(table: GuestsModalTable): number {
  if (table.guests != null && table.guests > 0) return table.guests;
  if (table.status !== "FREE") return table.defaultGuests ?? 0;
  return 0;
}

function mergePartnerPool(
  primary: GuestsModalTable,
  allTables: GuestsModalTable[],
): GuestsModalTable[] {
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

interface Props {
  primaryTable: GuestsModalTable;
  tables: GuestsModalTable[];
  initialGuests?: number;
  confirmLabel?: string;
  loading?: boolean;
  error?: string;
  onConfirm: (payload: GuestsConfirmPayload) => void;
  onCancel: () => void;
}

export function GuestsModal({
  primaryTable,
  tables: tablesProp,
  initialGuests,
  confirmLabel = "Apri tavolo",
  loading = false,
  error = "",
  onConfirm,
  onCancel,
}: Props) {
  const tables = Array.isArray(tablesProp) ? tablesProp : [];
  const startValue =
    initialGuests != null && initialGuests > 0
      ? String(initialGuests)
      : primaryTable.guests != null && primaryTable.guests > 0
        ? String(primaryTable.guests)
        : "";

  const [guestsInput, setGuestsInput] = useState(startValue);
  const [mergeEnabled, setMergeEnabled] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);

  const partners = useMemo(
    () => mergePartnerPool(primaryTable, tables),
    [primaryTable, tables],
  );

  const guests = Math.max(0, Math.floor(Number.parseInt(guestsInput, 10) || 0));

  const toggleMerge = (id: string) => {
    setMergeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const enableMerge = (on: boolean) => {
    setMergeEnabled(on);
    if (!on) setMergeIds([]);
  };

  const dec = () => {
    const next = Math.max(1, guests - 1);
    setGuestsInput(String(next));
  };

  const inc = () => {
    const next = Math.max(1, guests + 1);
    setGuestsInput(String(next));
  };

  const mergeLabels = mergeIds
    .map((id) => {
      const label = tables.find((t) => t.id === id)?.label;
      return label ? formatTableLabel(label) : undefined;
    })
    .filter(Boolean);

  const primaryLabel = formatTableLabel(primaryTable.label);

  const canSubmit =
    !loading && guests >= 1 && (!mergeEnabled || mergeIds.length >= 1);

  const submitHint =
    mergeEnabled && mergeIds.length === 0
      ? "Seleziona almeno un tavolo da unire"
      : guests < 1
        ? "Inserisci almeno 1 coperto"
        : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl sm:rounded-2xl">
        <div className="border-b border-[hsl(var(--pg-border))] px-4 py-4">
          <h2 className="text-center text-lg font-bold">Coperti</h2>
          <p className="mt-1 text-center text-sm font-medium text-[hsl(var(--pg-muted-foreground))]">
            {primaryLabel}
            {mergeEnabled && mergeLabels.length > 0 ? ` + ${mergeLabels.join(" + ")}` : ""}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="pb-1">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
              Numero coperti
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-14 w-14 text-2xl"
                onClick={dec}
                disabled={guests <= 1 || loading}
              >
                −
              </Button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="h-14 w-24 rounded-xl border border-[hsl(var(--pg-border))] bg-transparent text-center text-3xl font-bold tabular-nums"
                value={guestsInput}
                disabled={loading}
                placeholder="1"
                onChange={(e) => setGuestsInput(e.target.value.replace(/[^\d]/g, ""))}
              />
              <Button
                type="button"
                variant="outline"
                className="h-14 w-14 text-2xl"
                onClick={inc}
                disabled={loading}
              >
                +
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className={`h-11 w-full text-sm ${mergeEnabled ? "bg-[hsl(var(--pg-muted))]/40" : ""}`}
            disabled={loading}
            onClick={() => enableMerge(!mergeEnabled)}
          >
            Unisci con altri tavoli
          </Button>

          {mergeEnabled && (
            <section className="space-y-3 border-t border-[hsl(var(--pg-border))] pt-3">
              <p className="text-xs font-medium text-[hsl(var(--pg-muted-foreground))]">
                Seleziona i tavoli da aggiungere a {primaryLabel}
              </p>
              {partners.length === 0 ? (
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Nessun altro tavolo disponibile.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {partners.map((t) => {
                    const selected = mergeIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={loading}
                        onClick={() => toggleMerge(t.id)}
                        className={`min-h-[56px] rounded-lg border px-1 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15 text-[hsl(var(--pg-primary))] shadow-sm ring-1 ring-[hsl(var(--pg-primary))]/30"
                            : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/25 text-[hsl(var(--pg-foreground))]"
                        }`}
                      >
                        {selected && <span className="mr-0.5">✓</span>}
                        {formatTableLabel(t.label)}
                        <span
                          className={`mt-0.5 block text-[9px] font-normal ${
                            selected ? "opacity-90" : "opacity-75"
                          }`}
                        >
                          {guestsAt(t)} cop.
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {mergeIds.length > 0 && (
                <p className="text-center text-sm font-semibold text-[hsl(var(--pg-foreground))]">
                  {guests >= 1 ? `${guests} coperti` : "—"} · gruppo {primaryLabel}
                  {mergeLabels.length > 0 ? ` + ${mergeLabels.join(" + ")}` : ""}
                </p>
              )}
            </section>
          )}

          {submitHint && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{submitHint}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-[hsl(var(--pg-border))] p-4">
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 flex-1"
            disabled={loading}
            onClick={onCancel}
          >
            Annulla
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1 font-semibold"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                guests: Math.max(1, guests),
                mergeTableIds: mergeEnabled ? mergeIds : [],
              })
            }
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
