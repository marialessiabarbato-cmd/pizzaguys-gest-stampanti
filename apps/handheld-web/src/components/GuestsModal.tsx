import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";
import { TableUnionChips } from "./TableUnionChips";
import {
  combinedSeats,
  guestsAt,
  mergePartnerPool,
  tableSeats,
} from "../lib/table-seats";
import { formatTableLabel } from "../lib/table-display";
import type { LiveTable } from "../lib/types";

export type GuestsConfirmPayload = {
  /** Totale gruppo (somma per tavolo). */
  guests: number;
  mergeTableIds: string[];
  /** Coperti per ogni tavolo fisico del gruppo. */
  guestsByTable: Record<string, number>;
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

function defaultGuestsFor(table: LiveTable, fallback = 1): number {
  if (table.guests != null && table.guests > 0) return table.guests;
  return Math.max(1, fallback);
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
  const existingLinked = useMemo(() => {
    if (primaryTable.linkedTableIds?.length) return [...primaryTable.linkedTableIds];
    return tables
      .filter((t) => t.mergedIntoTableId === primaryTable.id)
      .map((t) => t.id);
  }, [primaryTable.id, primaryTable.linkedTableIds, tables]);

  /** simple = solo coperti; merge = selezione tavoli da unire */
  const [step, setStep] = useState<"simple" | "merge">("simple");
  const [mergeEnabled, setMergeEnabled] = useState(existingLinked.length > 0);
  const [mergeIds, setMergeIds] = useState<string[]>(() => [...existingLinked]);
  const [guestsByTable, setGuestsByTable] = useState<Record<string, number>>(() => {
    const linked =
      primaryTable.linkedTableIds?.length
        ? primaryTable.linkedTableIds
        : tables
            .filter((t) => t.mergedIntoTableId === primaryTable.id)
            .map((t) => t.id);
    const init: Record<string, number> = {
      [primaryTable.id]: Math.max(
        1,
        initialGuests != null && initialGuests > 0
          ? initialGuests
          : defaultGuestsFor(primaryTable, 1),
      ),
    };
    for (const id of linked) {
      const t = tables.find((x) => x.id === id);
      init[id] = t ? defaultGuestsFor(t, 1) : 1;
    }
    return init;
  });

  const partners = useMemo(
    () =>
      mergePartnerPool(primaryTable, tables).filter(
        (t) => !existingLinked.includes(t.id),
      ),
    [primaryTable, tables, existingLinked],
  );

  const involvedIds = useMemo(() => {
    const extra = mergeEnabled ? mergeIds : existingLinked;
    return [...new Set([primaryTable.id, ...extra])];
  }, [mergeEnabled, mergeIds, primaryTable.id, existingLinked]);

  const seatsHint = Math.max(
    1,
    involvedIds.length > 1
      ? Math.max(combinedSeats(involvedIds, tables), baseCap)
      : baseCap,
  );

  const totalGuests = involvedIds.reduce(
    (sum, id) => sum + Math.max(1, guestsByTable[id] ?? 1),
    0,
  );

  const setMemberGuests = (id: string, value: number) => {
    setGuestsByTable((prev) => ({ ...prev, [id]: Math.max(1, value) }));
  };

  const toggleMerge = (id: string) => {
    setMergeIds((prev) => {
      if (prev.includes(id)) {
        setGuestsByTable((g) => {
          const next = { ...g };
          delete next[id];
          return next;
        });
        return prev.filter((x) => x !== id);
      }
      const partner = tables.find((t) => t.id === id);
      setGuestsByTable((g) => ({
        ...g,
        [id]: partner ? Math.max(1, guestsAt(partner) || 1) : 1,
      }));
      return [...prev, id];
    });
  };

  const openMergeStep = () => {
    setMergeEnabled(true);
    setStep("merge");
  };

  const backToSimple = () => {
    setStep("simple");
    if (existingLinked.length === 0 && mergeIds.length === 0) {
      setMergeEnabled(false);
    }
  };

  const mergeLabels = mergeIds
    .map((id) => {
      const label = tables.find((t) => t.id === id)?.label;
      return label ? formatTableLabel(label) : undefined;
    })
    .filter(Boolean);

  const primaryLabel = formatTableLabel(primaryTable.label);
  const showPerTable = involvedIds.length > 1;
  const newMergeIds = mergeIds.filter((id) => !existingLinked.includes(id));

  const canSubmit =
    !loading &&
    totalGuests >= 1 &&
    (!mergeEnabled || mergeIds.length >= 1 || existingLinked.length > 0);

  const submitHint =
    step === "merge" &&
    mergeEnabled &&
    mergeIds.length === 0 &&
    existingLinked.length === 0
      ? "Seleziona almeno un tavolo da unire"
      : "";

  const buildPayload = (): GuestsConfirmPayload => {
    const byTable: Record<string, number> = {};
    for (const id of involvedIds) {
      byTable[id] = Math.max(1, guestsByTable[id] ?? 1);
    }
    return {
      guests: Object.values(byTable).reduce((a, b) => a + b, 0),
      mergeTableIds: newMergeIds,
      guestsByTable: byTable,
    };
  };

  return (
    <BottomSheet maxHeightClass="max-h-[88dvh]">
        <div className="border-b border-[hsl(var(--pg-border))] px-4 pb-4 pt-1">
          <h2 className="text-center text-lg font-bold">
            {step === "merge" ? "Unisci tavoli" : "Coperti"}
          </h2>
          <p className="mt-1 text-center text-sm font-medium text-[hsl(var(--pg-muted-foreground))]">
            {primaryLabel}
            {showPerTable && mergeLabels.length > 0
              ? ` + ${mergeLabels.join(" + ")}`
              : ""}
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="rounded-full bg-[hsl(var(--pg-muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--pg-muted-foreground))]">
              Posti tavolo: {baseCap}
            </span>
            {showPerTable && (
              <span className="rounded-full bg-[hsl(var(--pg-muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--pg-muted-foreground))]">
                Posti gruppo: {seatsHint}
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {step === "simple" && (
            <>
              {!showPerTable ? (
                <div className="pb-1">
                  <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Numero coperti
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-14 text-2xl"
                      onClick={() =>
                        setMemberGuests(
                          primaryTable.id,
                          (guestsByTable[primaryTable.id] ?? 1) - 1,
                        )
                      }
                      disabled={(guestsByTable[primaryTable.id] ?? 1) <= 1 || loading}
                    >
                      −
                    </Button>
                    <span className="min-w-[3rem] text-center text-4xl font-bold tabular-nums">
                      {guestsByTable[primaryTable.id] ?? 1}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-14 text-2xl"
                      onClick={() =>
                        setMemberGuests(
                          primaryTable.id,
                          (guestsByTable[primaryTable.id] ?? 1) + 1,
                        )
                      }
                      disabled={loading}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Coperti per tavolo
                  </p>
                  <p className="text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
                    Conto unico · coperti separati (es. adulti / bambini)
                  </p>
                  {involvedIds.map((id) => {
                    const t =
                      tables.find((x) => x.id === id) ??
                      (id === primaryTable.id ? primaryTable : null);
                    const label = t ? formatTableLabel(t.label) : id;
                    const value = guestsByTable[id] ?? 1;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-11 text-xl"
                            onClick={() => setMemberGuests(id, value - 1)}
                            disabled={value <= 1 || loading}
                          >
                            −
                          </Button>
                          <span className="min-w-[2rem] text-center text-xl font-bold tabular-nums">
                            {value}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-11 text-xl"
                            onClick={() => setMemberGuests(id, value + 1)}
                            disabled={loading}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-center text-sm font-semibold">
                    Totale: {totalGuests} coperti
                    {totalGuests > seatsHint
                      ? ` · oltre i posti (${seatsHint})`
                      : ` · ${seatsHint} posti`}
                  </p>
                  {showPerTable && (
                    <TableUnionChips
                      host={{ ...primaryTable, linkedTableIds: involvedIds.slice(1) }}
                      allTables={tables}
                      size="md"
                      tone="neutral"
                    />
                  )}
                </div>
              )}

              {(partners.length > 0 || existingLinked.length > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 w-full text-sm"
                  disabled={loading}
                  onClick={openMergeStep}
                >
                  {existingLinked.length > 0
                    ? "Modifica unione tavoli"
                    : "Unisci con altri tavoli"}
                </Button>
              )}
            </>
          )}

          {step === "merge" && (
            <section className="space-y-3">
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Seleziona i tavoli da aggiungere a {primaryLabel}
              </p>
              {partners.length === 0 && existingLinked.length === 0 ? (
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Nessun altro tavolo disponibile.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {existingLinked.map((id) => {
                    const t = tables.find((x) => x.id === id);
                    return (
                      <div
                        key={id}
                        className="min-h-[56px] rounded-lg border border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15 px-1 py-2 text-sm font-semibold text-[hsl(var(--pg-primary))]"
                      >
                        ✓ {t ? formatTableLabel(t.label) : id}
                        <span className="mt-0.5 block text-[11px] font-normal opacity-90">
                          già unito
                        </span>
                      </div>
                    );
                  })}
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
                          className={`mt-0.5 block text-[11px] font-normal ${
                            selected ? "opacity-90" : "opacity-75"
                          }`}
                        >
                          {guestsAt(t) || 1} cop. · {t.defaultGuests} posti
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {showPerTable && (
                <div className="space-y-3 border-t border-[hsl(var(--pg-border))] pt-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Coperti per tavolo
                  </p>
                  {involvedIds.map((id) => {
                    const t =
                      tables.find((x) => x.id === id) ??
                      (id === primaryTable.id ? primaryTable : null);
                    const label = t ? formatTableLabel(t.label) : id;
                    const value = guestsByTable[id] ?? 1;
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-11 text-xl"
                            onClick={() => setMemberGuests(id, value - 1)}
                            disabled={value <= 1 || loading}
                          >
                            −
                          </Button>
                          <span className="min-w-[2rem] text-center text-xl font-bold tabular-nums">
                            {value}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-11 text-xl"
                            onClick={() => setMemberGuests(id, value + 1)}
                            disabled={loading}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-center text-sm font-semibold">
                    Totale: {totalGuests} · {seatsHint} posti
                  </p>
                  <TableUnionChips
                    host={{ ...primaryTable, linkedTableIds: mergeIds }}
                    allTables={tables}
                    size="md"
                    tone="neutral"
                  />
                </div>
              )}
            </section>
          )}

          {submitHint && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{submitHint}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className={bottomSheetFooterClass}>
          {step === "merge" ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 flex-1"
              disabled={loading}
              onClick={backToSimple}
            >
              Indietro
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="min-h-12 flex-1"
              disabled={loading}
              onClick={onCancel}
            >
              Annulla
            </Button>
          )}
          <Button
            type="button"
            className="min-h-12 flex-1 font-semibold"
            disabled={!canSubmit}
            onClick={() => onConfirm(buildPayload())}
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </div>
    </BottomSheet>
  );
}
