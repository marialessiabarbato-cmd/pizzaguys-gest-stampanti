import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { TableUnionChips } from "./TableUnionChips";
import {
  combinedSeats,
  guestsAt,
  mergePartnerPool,
  projectedGuests,
  tableSeats,
} from "../lib/table-seats";
import type { LiveTable } from "../lib/types";

export type GuestsConfirmPayload = {
  guests: number;
  mergeTableIds: string[];
};

interface Props {
  primaryTable: LiveTable;
  tables: LiveTable[];
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
  const baseCap = Math.max(1, tableSeats(primaryTable));
  const startGuests = Math.max(
    1,
    Math.min(initialGuests ?? primaryTable.guests ?? primaryTable.defaultGuests ?? 2, baseCap),
  );

  const [guests, setGuests] = useState(startGuests);
  const [mergeEnabled, setMergeEnabled] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);

  const partners = useMemo(
    () => mergePartnerPool(primaryTable, tables),
    [primaryTable, tables],
  );

  const involvedIds = useMemo(
    () => (mergeEnabled ? [primaryTable.id, ...mergeIds] : [primaryTable.id]),
    [mergeEnabled, mergeIds, primaryTable.id],
  );

  const maxGuests = Math.max(
    1,
    mergeEnabled ? Math.max(combinedSeats(involvedIds, tables), baseCap) : baseCap,
  );

  const toggleMerge = (id: string) => {
    setMergeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const involved = [primaryTable.id, ...next];
      const nextCap = Math.max(combinedSeats(involved, tables), baseCap);
      const projected = projectedGuests(involved, tables);
      setGuests((g) => Math.min(Math.max(Math.max(g, 1), projected), Math.max(1, nextCap)));
      return next;
    });
  };

  const enableMerge = (on: boolean) => {
    setMergeEnabled(on);
    if (!on) {
      setMergeIds([]);
      setGuests((g) => Math.min(Math.max(g, 1), Math.max(1, baseCap)));
    }
  };

  const dec = () => setGuests((g) => Math.max(1, g - 1));
  const inc = () => setGuests((g) => Math.min(maxGuests, g + 1));

  const mergeLabels = mergeIds
    .map((id) => tables.find((t) => t.id === id)?.label)
    .filter(Boolean);

  const canSubmit =
    !loading &&
    (!mergeEnabled || mergeIds.length >= 1) &&
    guests <= maxGuests &&
    guests >= 1;

  const submitHint =
    mergeEnabled && mergeIds.length === 0
      ? "Seleziona almeno un tavolo da unire"
      : guests > maxGuests
        ? "Troppi coperti per i posti disponibili"
        : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl sm:rounded-2xl">
        <div className="border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-center text-lg font-bold">Coperti</h2>
          <p className="text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Tavolo {primaryTable.label}
            {mergeEnabled && mergeLabels.length > 0
              ? ` + ${mergeLabels.join(" + ")}`
              : ""}
          </p>
          <p className="mt-1 text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
            {mergeEnabled && mergeIds.length > 0
              ? `${maxGuests} posti totali`
              : `Capienza: ${baseCap} posti`}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-14 w-14 text-2xl"
              onClick={dec}
              disabled={guests <= 1 || loading}
            >
              −
            </Button>
            <span className="min-w-[3rem] text-center text-4xl font-bold tabular-nums">
              {guests}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-14 w-14 text-2xl"
              onClick={inc}
              disabled={guests >= maxGuests || loading}
            >
              +
            </Button>
          </div>

          {guests >= baseCap && !mergeEnabled && (
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/5 px-3 py-2 text-sm text-[hsl(var(--pg-primary))]"
              onClick={() => enableMerge(true)}
            >
              Servono più posti? Unisci altri tavoli
            </button>
          )}

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${
              mergeEnabled
                ? "border-amber-300 bg-amber-50"
                : "border-[hsl(var(--pg-border))]"
            }`}
          >
            <input
              type="checkbox"
              className="h-5 w-5 accent-amber-500"
              checked={mergeEnabled}
              disabled={loading}
              onChange={(e) => enableMerge(e.target.checked)}
            />
            <span className="text-sm font-medium">
              ⊕ Unisci con altri tavoli
            </span>
          </label>

          {mergeEnabled && (
            <section className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-900">
                Seleziona i tavoli da aggiungere a {primaryTable.label}
              </p>
              {partners.length === 0 ? (
                <p className="text-sm text-amber-700">Nessun altro tavolo disponibile.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {partners.map((t) => {
                    const selected = mergeIds.includes(t.id);
                    const isFree = t.status === "FREE";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={loading}
                        onClick={() => toggleMerge(t.id)}
                        className={`min-h-[56px] rounded-lg border-2 px-1 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border-amber-500 bg-amber-400/30 text-amber-950 shadow-sm"
                            : isFree
                              ? "border-dashed border-amber-200 bg-white/60"
                              : "border-[hsl(var(--pg-border))] bg-white"
                        }`}
                      >
                        {selected && (
                          <span className="mr-0.5 text-[hsl(var(--pg-primary))]">✓</span>
                        )}
                        {t.label}
                        <span className="mt-0.5 block text-[9px] font-normal opacity-70">
                          {guestsAt(t)} cop. · {t.defaultGuests} posti
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {mergeIds.length > 0 && (
                <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-white p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    Gruppo che verrà creato
                  </p>
                  <TableUnionChips
                    host={{ ...primaryTable, linkedTableIds: mergeIds }}
                    allTables={tables}
                    size="md"
                  />
                  <p className="text-center text-sm font-semibold text-amber-950">
                    {guests} coperti · {maxGuests} posti
                  </p>
                </div>
              )}
            </section>
          )}

          {submitHint && <p className="text-sm text-amber-700">{submitHint}</p>}
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
                guests,
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
