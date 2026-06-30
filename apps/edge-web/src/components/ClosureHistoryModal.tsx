import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi, edgeApiDownload } from "../lib/api";

interface ClosureArchiveRow {
  id: string;
  closureDate: string;
  zNumber: number | null;
  theoretical: { total: number; cash: number; pos: number; transactionCount: number };
  declared: { cash: number; pos: number };
  discrepancy: { total: number };
  syncedAt: string | null;
  createdAt: string;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function daysAgoKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function ClosureHistoryModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(daysAgoKey(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ClosureArchiveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      const data = await edgeApi<{ closures: ClosureArchiveRow[] }>(
        `/api/closure/history?${params}`,
      );
      setRows(data.closures);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCsv = async () => {
    setCsvLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      await edgeApiDownload(`/api/closure/export.csv?${params}`, `chiusure-${from}_${to}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore export CSV");
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Storico chiusure locali</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Da
            <input
              type="date"
              className="mt-1 block rounded-lg border px-3 py-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            A
            <input
              type="date"
              className="mt-1 block rounded-lg border px-3 py-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Aggiorna
          </Button>
          <Button onClick={() => void downloadCsv()} disabled={csvLoading}>
            Scarica CSV
          </Button>
        </div>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        {loading ? (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessuna chiusura nel periodo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))]">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Z</th>
                  <th className="px-3 py-2 text-right">Totale</th>
                  <th className="px-3 py-2 text-right">Scostamento</th>
                  <th className="px-3 py-2">Cloud</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row) => (
                  <tr key={row.id} className="border-t border-[hsl(var(--pg-border))]">
                    <td className="px-3 py-2">{row.closureDate}</td>
                    <td className="px-3 py-2">{row.zNumber ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(row.theoretical.total)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.discrepancy.total !== 0 ? "text-orange-600" : ""
                      }`}
                    >
                      {euro(row.discrepancy.total)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.syncedAt
                        ? new Date(row.syncedAt).toLocaleString("it-IT")
                        : "In attesa"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </div>
  );
}
