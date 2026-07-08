import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";

interface OpenTableRow {
  tableId: string;
  tableLabel: string;
  roomId: string | null;
  roomName: string;
  status: string;
  guests: number;
  subtotal: number;
  averagePerCover: number;
  operatorName: string;
  operatorId: string | null;
  lastOrderLabel: string | null;
  courseLabel: string;
  openedElapsed: string;
  lastOrderElapsed: string;
}

interface OpenTablesSummary {
  collected: { guests: number; total: number };
  uncollected: { guests: number; total: number; tables: number };
  total: { total: number; average: number };
}

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export function OpenTablesModal({
  shiftId,
  rooms,
  embedded = false,
  onClose,
  onSelectTable,
}: {
  shiftId?: string;
  rooms: Array<{ id: string; name: string }>;
  embedded?: boolean;
  onClose: () => void;
  onSelectTable: (tableId: string) => void;
}) {
  const [roomId, setRoomId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [rows, setRows] = useState<OpenTableRow[]>([]);
  const [summary, setSummary] = useState<OpenTablesSummary | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (roomId) params.set("roomId", roomId);
      if (operatorId) params.set("operatorId", operatorId);
      if (shiftId) params.set("shiftId", shiftId);
      const data = await edgeApi<{ rows: OpenTableRow[]; summary: OpenTablesSummary }>(
        `/api/pos/open-tables?${params}`,
      );
      setRows(data.rows);
      setSummary(data.summary);
    } catch (err) {
      setRows([]);
      setSummary(null);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [roomId, operatorId, shiftId]);

  useEffect(() => {
    void edgeApi<StaffRow[]>("/api/staff")
      .then(setStaff)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col"
          : "fixed inset-0 z-50 flex flex-col bg-black/50 p-2 sm:p-4"
      }
    >
      <div
        className={
          embedded
            ? "flex min-h-0 w-full flex-1 flex-col rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]"
            : "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col rounded-xl bg-[hsl(var(--pg-background))] shadow-xl"
        }
      >
        <header className="shrink-0 border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Tavoli aperti</h2>
            <Button variant="ghost" className="h-9" onClick={onClose}>
              Chiudi
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-[hsl(var(--pg-muted-foreground))]">Sala</span>
              <select
                className="h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="">Tutte le sale</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[hsl(var(--pg-muted-foreground))]">Operatore</span>
              <select
                className="h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
              >
                <option value="">Tutti gli operatori</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button className="h-10 w-full" variant="outline" onClick={() => void load()}>
                Aggiorna
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <p className="shrink-0 bg-red-500/10 px-4 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-[hsl(var(--pg-muted))] text-left text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Ultimo ordine</th>
                <th className="px-3 py-2">Tavolo</th>
                <th className="px-3 py-2">Coperti</th>
                <th className="px-3 py-2">Portata</th>
                <th className="px-3 py-2">Operatore</th>
                <th className="px-3 py-2">Da apertura</th>
                <th className="px-3 py-2">Da ultimo ord.</th>
                <th className="px-3 py-2 text-right">Subtotale</th>
                <th className="px-3 py-2 text-right">Media/cop.</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
                    Caricamento…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
                    Nessun tavolo aperto
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.tableId}
                    className="cursor-pointer border-t border-[hsl(var(--pg-border))] hover:bg-[hsl(var(--pg-muted))]/40"
                    onClick={() => {
                      onSelectTable(row.tableId);
                      onClose();
                    }}
                  >
                    <td className="max-w-[140px] truncate px-3 py-2">{row.lastOrderLabel ?? "—"}</td>
                    <td className="px-3 py-2 font-semibold">{row.tableLabel}</td>
                    <td className="px-3 py-2 tabular-nums">{row.guests}</td>
                    <td className="px-3 py-2">{row.courseLabel}</td>
                    <td className="px-3 py-2">{row.operatorName}</td>
                    <td className="px-3 py-2 tabular-nums">{row.openedElapsed}</td>
                    <td className="px-3 py-2 tabular-nums">{row.lastOrderElapsed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(row.subtotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(row.averagePerCover)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {summary && (
          <footer className="shrink-0 grid grid-cols-1 gap-3 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 px-4 py-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                Incassato
              </p>
              <p className="text-sm">Coperti: {summary.collected.guests}</p>
              <p className="font-semibold tabular-nums">{euro(summary.collected.total)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                Da incassare
              </p>
              <p className="text-sm">
                Coperti: {summary.uncollected.guests} · Tavoli: {summary.uncollected.tables}
              </p>
              <p className="font-semibold tabular-nums">{euro(summary.uncollected.total)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                Totale giornata
              </p>
              <p className="font-semibold tabular-nums">{euro(summary.total.total)}</p>
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Media: {euro(summary.total.average)}
              </p>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
