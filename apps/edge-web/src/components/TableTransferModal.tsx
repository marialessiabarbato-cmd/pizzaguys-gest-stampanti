import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { PinModal } from "./PinModal";
import { edgeApi } from "../lib/api";

type TransferMode = "transfer" | "merge";

interface Room {
  id: string;
  name: string;
}

interface LiveTable {
  id: string;
  label: string;
  status: string;
  isVirtual: boolean;
  roomId?: string | null;
  defaultGuests?: number;
  guests?: number;
}

interface BillLine {
  id: string;
  name: string;
  quantity: number;
}

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
}

const OCCUPIED_STATUSES = new Set(["OCCUPIED", "LOCKED", "BILL_REQUESTED"]);

function guestsAt(table: LiveTable): number {
  if (table.guests != null && table.guests > 0) return table.guests;
  if (table.status !== "FREE") return table.defaultGuests ?? 0;
  return 0;
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
  billLines,
  tables,
  rooms,
  connected,
  onClose,
  onSuccess,
}: {
  sourceTable: LiveTable;
  operator: Operator;
  billLines: BillLine[];
  tables: LiveTable[];
  rooms: Room[];
  connected: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [mode, setMode] = useState<TransferMode>("transfer");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [mergeTableIds, setMergeTableIds] = useState<string[]>([sourceTable.id]);
  const [partial, setPartial] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [roomFilter, setRoomFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const physicalTables = useMemo(
    () => tables.filter((t) => !t.isVirtual),
    [tables],
  );

  const occupiedTables = useMemo(
    () => physicalTables.filter((t) => OCCUPIED_STATUSES.has(t.status)),
    [physicalTables],
  );

  const mergeSources = mergeTableIds.filter((id) => id !== targetId);
  const targetTable = targetId ? tables.find((t) => t.id === targetId) : undefined;
  const targetLabel = targetTable?.label ?? "";
  const targetCapacity = targetTable?.defaultGuests ?? 0;

  const projectedTotal =
    targetId && mode === "merge"
      ? projectedGuests(mergeSources, targetId, tables)
      : targetId && mode === "transfer" && !partial
        ? projectedGuests([sourceTable.id], targetId, tables)
        : null;

  const overCapacity =
    projectedTotal != null && targetCapacity > 0 && projectedTotal > targetCapacity;

  const filteredTargets = physicalTables.filter((t) => {
    if (mode === "transfer" && t.id === sourceTable.id) return false;
    if (roomFilter === "ALL") return true;
    return t.roomId === roomFilter;
  });

  const toggleMergeTable = (id: string) => {
    setMergeTableIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    if (targetId === id) setTargetId(null);
  };

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const executeTransfer = async (overridePin?: string) => {
    setLoading(true);
    setError("");
    try {
      const body = {
        operatorId: operator.id,
        operatorName: `${operator.firstName} ${operator.lastName}`,
        overridePin,
      };

      if (mode === "merge") {
        if (!targetId) throw new Error("Seleziona il tavolo destinazione");
        if (mergeSources.length < 2) {
          throw new Error("Seleziona almeno 2 tavoli da unire (esclusa la destinazione)");
        }
        await edgeApi("/api/tables/merge", {
          method: "POST",
          body: JSON.stringify({
            ...body,
            sourceTableIds: mergeSources,
            targetTableId: targetId,
          }),
        });
        onSuccess(`Tavoli uniti su ${targetLabel}`);
      } else {
        if (!targetId) throw new Error("Seleziona il tavolo destinazione");
        const lineIds =
          partial && selectedLineIds.size > 0 ? [...selectedLineIds] : undefined;
        await edgeApi("/api/tables/transfer", {
          method: "POST",
          body: JSON.stringify({
            ...body,
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
      }
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
    connected &&
    !loading &&
    targetId &&
    !overCapacity &&
    (mode === "merge"
      ? mergeSources.length >= 2
      : billLines.length > 0 && (!partial || selectedLineIds.size > 0));

  const switchMode = (next: TransferMode) => {
    setMode(next);
    setTargetId(null);
    setError("");
    if (next === "merge" && !mergeTableIds.includes(sourceTable.id)) {
      setMergeTableIds((prev) => [...prev, sourceTable.id]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-[hsl(var(--pg-background))] shadow-xl">
        <div className="border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-lg font-bold">Sposta / unisci tavoli</h2>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Tavolo attuale: {sourceTable.label}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "transfer" ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={() => switchMode("transfer")}
            >
              Sposta conto
            </Button>
            <Button
              variant={mode === "merge" ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={() => switchMode("merge")}
            >
              Unisci tavoli
            </Button>
          </div>

          {mode === "merge" && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">
                Seleziona i tavoli da unire{" "}
                <span className="font-normal text-[hsl(var(--pg-muted-foreground))]">
                  (minimo 2)
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {occupiedTables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleMergeTable(t.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      mergeTableIds.includes(t.id)
                        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                        : "border-[hsl(var(--pg-border))]"
                    }`}
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-[10px] opacity-70">
                      {guestsAt(t)} coperti
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {mode === "transfer" && billLines.length > 0 && (
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
                  {billLines.map((l) => (
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
            <h3 className="mb-2 text-sm font-semibold">
              {mode === "merge" ? "Conto finale su" : "Tavolo destinazione"}
            </h3>
            {rooms.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setRoomFilter("ALL")}
                  className={`rounded px-2 py-1 text-xs ${roomFilter === "ALL" ? "bg-[hsl(var(--pg-primary))] text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                >
                  Tutte
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
            <div className="grid grid-cols-4 gap-2">
              {filteredTargets.map((t) => {
                const cap = t.defaultGuests ?? 0;
                const current = guestsAt(t);
                const wouldBe =
                  targetId === t.id
                    ? projectedTotal
                    : mode === "merge" && mergeSources.length >= 2
                      ? projectedGuests(mergeSources, t.id, tables)
                      : mode === "transfer" && !partial
                        ? projectedGuests([sourceTable.id], t.id, tables)
                        : null;
                const exceeds = wouldBe != null && cap > 0 && wouldBe > cap;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={t.status === "SPLIT_IN_PROGRESS"}
                    onClick={() => setTargetId(t.id)}
                    className={`min-h-12 rounded-lg border text-sm font-medium ${
                      targetId === t.id
                        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15"
                        : exceeds
                          ? "border-red-400 bg-red-50"
                          : "border-[hsl(var(--pg-border))]"
                    }`}
                  >
                    {t.label}
                    <span className="block text-[10px] font-normal opacity-70">
                      max {cap}
                      {current > 0 ? ` · ${current}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {projectedTotal != null && targetCapacity > 0 && (
              <p
                className={`mt-2 text-sm ${overCapacity ? "font-medium text-red-600" : "text-[hsl(var(--pg-muted-foreground))]"}`}
              >
                Coperti: {projectedTotal} / {targetCapacity} posti
                {overCapacity && " — capienza insufficiente"}
              </p>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-[hsl(var(--pg-border))] p-4">
          <Button variant="outline" className="h-11 flex-1" onClick={onClose}>
            Annulla
          </Button>
          <Button className="h-11 flex-1" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
            Conferma
          </Button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title={mode === "merge" ? "Unire i tavoli?" : "Spostare il conto?"}
          message={
            mode === "merge"
              ? `Unire ${mergeSources.length} tavoli su ${targetLabel}?`
              : `Spostare il conto su ${targetLabel}?`
          }
          confirmLabel="Conferma"
          onConfirm={() => void executeTransfer()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {pinOpen && (
        <PinModal
          title="PIN manager"
          onComplete={(pin) => void executeTransfer(pin)}
          onCancel={() => setPinOpen(false)}
          error=""
        />
      )}
    </div>
  );
}
