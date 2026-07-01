import { Button } from "@pizzaguys/ui";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { PinModal } from "./PinModal";
import { edgeApi } from "../lib/api";
import type { CartLine, LiveTable, Operator, SubmittedLine } from "../lib/types";

interface Room {
  id: string;
  name: string;
}

interface TransferLine {
  id: string;
  name: string;
  quantity: number;
}

function guestsAt(table: LiveTable): number {
  if (table.guests != null && table.guests > 0) return table.guests;
  if (table.status !== "FREE") return table.defaultGuests ?? 0;
  return 0;
}

function tableSeats(table: LiveTable): number {
  return table.tableCapacity ?? table.defaultGuests ?? 0;
}

function projectedGuests(
  sourceIds: string[],
  targetId: string,
  allTables: LiveTable[],
): number {
  let total = 0;
  const counted = new Set<string>();
  for (const id of [...sourceIds, targetId]) {
    if (counted.has(id)) continue;
    counted.add(id);
    const t = allTables.find((x) => x.id === id);
    if (t) total += guestsAt(t);
  }
  return total;
}

export function TableTransferModal({
  sourceTable,
  operator,
  cart,
  submittedLines,
  tables,
  rooms,
  isOffline,
  onRefresh,
  onClose,
  onSuccess,
}: {
  sourceTable: LiveTable;
  operator: Operator;
  cart: CartLine[];
  submittedLines: SubmittedLine[];
  tables: LiveTable[];
  rooms: Room[];
  isOffline: boolean;
  onRefresh?: () => void;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [roomFilter, setRoomFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  const physicalTables = useMemo(
    () => tables.filter((t) => !t.isVirtual && t.id !== sourceTable.id),
    [tables, sourceTable.id],
  );

  const roomName = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId);
    return table?.roomId ? (rooms.find((r) => r.id === table.roomId)?.name ?? "") : "";
  };

  const transferLines: TransferLine[] = useMemo(() => {
    const lines: TransferLine[] = [];
    for (const l of cart) {
      lines.push({ id: l.lineId, name: l.name, quantity: l.quantity });
    }
    for (const l of submittedLines) {
      const remaining = l.quantity - (l.voidedQuantity ?? 0);
      if (remaining > 0) {
        lines.push({ id: l.lineId, name: l.name, quantity: remaining });
      }
    }
    return lines;
  }, [cart, submittedLines]);

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const targetTable = targetId ? tables.find((t) => t.id === targetId) : undefined;
  const targetLabel = targetTable?.label ?? "";
  const targetCapacity = targetTable ? tableSeats(targetTable) : 0;
  const projectedTotal =
    targetId && !partial
      ? projectedGuests([sourceTable.id], targetId, tables)
      : null;
  const overCapacity =
    projectedTotal != null && targetCapacity > 0 && projectedTotal > targetCapacity;

  const filteredTargets = physicalTables.filter((t) => {
    if (roomFilter === "ALL") return true;
    return t.roomId === roomFilter;
  });

  const executeTransfer = async (overridePin?: string) => {
    setLoading(true);
    setError("");
    try {
      const lineIds =
        partial && selectedLineIds.size > 0 ? [...selectedLineIds] : undefined;
      await edgeApi("/api/tables/transfer", {
        method: "POST",
        body: JSON.stringify({
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
          overridePin,
          sourceTableId: sourceTable.id,
          targetTableId: targetId,
          lineIds,
        }),
      });
      onSuccess(
        lineIds
          ? `Righe spostate su ${targetLabel}`
          : `Conto spostato su ${targetLabel}`,
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore spostamento";
      if (msg.includes("bloccato") && !overridePin) {
        setPinOpen(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setPinOpen(false);
    }
  };

  const canSubmit =
    !isOffline &&
    !loading &&
    targetId &&
    !overCapacity &&
    transferLines.length > 0 &&
    (!partial || selectedLineIds.size > 0);

  const submitHint = !canSubmit
    ? isOffline
      ? "Connessione assente"
      : transferLines.length === 0
        ? "Nessuna riga da spostare"
        : !targetId
          ? "Scegli il tavolo destinazione"
          : overCapacity
            ? "Capienza insufficiente sul tavolo scelto"
            : partial && selectedLineIds.size === 0
              ? "Seleziona almeno una riga"
              : ""
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-lg font-bold">Sposta conto</h2>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Da {sourceTable.label} — tocca dove spostare
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {transferLines.length > 0 && (
            <section>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={partial}
                  onChange={(e) => {
                    setPartial(e.target.checked);
                    if (!e.target.checked) setSelectedLineIds(new Set());
                  }}
                />
                Sposta solo alcune righe
              </label>
              {partial && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {transferLines.map((l) => (
                    <li key={l.id}>
                      <label className="flex items-center gap-2 rounded-lg border border-[hsl(var(--pg-border))] px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedLineIds.has(l.id)}
                          onChange={() => toggleLine(l.id)}
                        />
                        {l.quantity}× {l.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Tavolo destinazione</h3>
            {rooms.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setRoomFilter("ALL")}
                  className={`rounded px-2 py-1 text-xs ${roomFilter === "ALL" ? "bg-[hsl(var(--pg-primary))] text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                >
                  Tutte le sale
                </button>
                {rooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoomFilter(r.id)}
                    className={`rounded px-2 py-1 text-xs ${roomFilter === r.id ? "bg-[hsl(var(--pg-primary))] text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {filteredTargets.map((t) => {
                const cap = tableSeats(t);
                const current = guestsAt(t);
                const wouldBe = !partial
                  ? projectedGuests([sourceTable.id], t.id, tables)
                  : null;
                const exceeds = wouldBe != null && cap > 0 && wouldBe > cap;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={t.status === "SPLIT_IN_PROGRESS"}
                    onClick={() => setTargetId(t.id)}
                    className={`min-h-14 rounded-lg border px-1 py-2 text-sm font-medium ${
                      targetId === t.id
                        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15"
                        : exceeds
                          ? "border-red-400 bg-red-50"
                          : "border-[hsl(var(--pg-border))]"
                    } ${t.status === "SPLIT_IN_PROGRESS" ? "opacity-40" : ""}`}
                  >
                    {t.label}
                    <span className="block text-[10px] font-normal opacity-70">
                      max {cap} posti
                      {current > 0 ? ` · ${current} ora` : ""}
                    </span>
                    {roomName(t.id) && (
                      <span className="block text-[9px] font-normal opacity-60">
                        {roomName(t.id)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {projectedTotal != null && targetCapacity > 0 && (
              <p
                className={`mt-2 text-sm ${overCapacity ? "font-medium text-red-600" : "text-[hsl(var(--pg-muted-foreground))]"}`}
              >
                Coperti dopo spostamento: {projectedTotal} / {targetCapacity} posti
                {overCapacity && " — capienza insufficiente"}
              </p>
            )}
          </section>

          {submitHint && <p className="text-sm text-amber-700">{submitHint}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {isOffline && (
            <p className="text-sm text-yellow-700">Offline — spostamento non disponibile</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-[hsl(var(--pg-border))] p-4">
          <Button variant="outline" className="min-h-12 flex-1" onClick={onClose}>
            Annulla
          </Button>
          <Button
            className="min-h-12 flex-1"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
          >
            {loading ? "..." : targetId ? `Sposta su ${targetLabel}` : "Conferma"}
          </Button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title="Spostare il conto?"
          message={
            partial
              ? `Spostare ${selectedLineIds.size} righe da ${sourceTable.label} a ${targetLabel}?`
              : `Spostare tutto il conto da ${sourceTable.label} a ${targetLabel} (${projectedTotal ?? "?"} coperti)?`
          }
          confirmLabel="Conferma"
          onConfirm={() => void executeTransfer()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {pinOpen && (
        <PinModal
          title="PIN manager — tavolo bloccato"
          onComplete={(pin) => void executeTransfer(pin)}
          onCancel={() => setPinOpen(false)}
          error=""
        />
      )}
    </div>
  );
}
