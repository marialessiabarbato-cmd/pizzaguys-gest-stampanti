import type { PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi, edgeApiDownload } from "../lib/api";
import { PAYMENT_LABELS } from "./PaymentMethodChangeModal";

interface ClosureTheoretical {
  total: number;
  cash: number;
  pos: number;
  transactionCount: number;
  byPaymentMethod: Record<string, number>;
}

interface ClosureArchiveRow {
  id: string;
  closureDate: string;
  zNumber: number | null;
  theoretical: ClosureTheoretical;
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
  syncedAt: string | null;
  createdAt: string;
}

interface ClosureArchiveDetail extends ClosureArchiveRow {
  operatorName: string | null;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function daysAgoKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function paymentLabel(method: string) {
  return PAYMENT_LABELS[method as PaymentMethod] ?? method;
}

function ClosureDetailPanel({
  detail,
  loading,
  error,
  onBack,
}: {
  detail: ClosureArchiveDetail | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento dettaglio...</p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (!detail) return null;

  const methods = Object.entries(detail.theoretical.byPaymentMethod ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="h-9 px-2 text-sm" onClick={onBack}>
        ← Torna all&apos;elenco
      </Button>

      <div>
        <h3 className="text-lg font-bold">Chiusura {detail.closureDate}</h3>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          {detail.zNumber != null ? `Z #${detail.zNumber}` : "Senza Z"} ·{" "}
          {new Date(detail.createdAt).toLocaleString("it-IT")}
          {detail.operatorName ? ` · ${detail.operatorName}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Totali teorici
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Contanti</dt>
              <dd className="tabular-nums">{euro(detail.theoretical.cash)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>POS</dt>
              <dd className="tabular-nums">{euro(detail.theoretical.pos)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[hsl(var(--pg-border))] pt-2 font-semibold">
              <dt>Totale</dt>
              <dd className="tabular-nums">{euro(detail.theoretical.total)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-[hsl(var(--pg-muted-foreground))]">
              <dt>Transazioni</dt>
              <dd>{detail.theoretical.transactionCount}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Conteggio dichiarato
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Contanti</dt>
              <dd className="tabular-nums">{euro(detail.declared.cash)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>POS</dt>
              <dd className="tabular-nums">{euro(detail.declared.pos)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-[hsl(var(--pg-border))] pt-2 font-semibold">
              <dt>Totale</dt>
              <dd className="tabular-nums">{euro(detail.declared.cash + detail.declared.pos)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
          Scostamenti
        </h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex justify-between gap-3 sm:flex-col sm:justify-start">
            <dt className="text-[hsl(var(--pg-muted-foreground))]">Contanti</dt>
            <dd
              className={`tabular-nums ${
                detail.discrepancy.cash !== 0 ? "font-medium text-orange-600" : ""
              }`}
            >
              {euro(detail.discrepancy.cash)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 sm:flex-col sm:justify-start">
            <dt className="text-[hsl(var(--pg-muted-foreground))]">POS</dt>
            <dd
              className={`tabular-nums ${
                detail.discrepancy.pos !== 0 ? "font-medium text-orange-600" : ""
              }`}
            >
              {euro(detail.discrepancy.pos)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 sm:flex-col sm:justify-start">
            <dt className="font-medium">Totale</dt>
            <dd
              className={`tabular-nums font-semibold ${
                detail.discrepancy.total !== 0 ? "text-orange-600" : "text-green-600"
              }`}
            >
              {euro(detail.discrepancy.total)}
            </dd>
          </div>
        </dl>
      </section>

      {methods.length > 0 && (
        <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Per metodo di pagamento
          </h4>
          <dl className="space-y-2 text-sm">
            {methods.map(([method, amount]) => (
              <div key={method} className="flex justify-between gap-3">
                <dt>{paymentLabel(method)}</dt>
                <dd className="tabular-nums">{euro(amount)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="rounded-lg bg-[hsl(var(--pg-muted))]/40 px-4 py-3 text-sm">
        <strong>Sync cloud:</strong>{" "}
        {detail.syncedAt
          ? `completata il ${new Date(detail.syncedAt).toLocaleString("it-IT")}`
          : "in attesa o non configurata"}
      </section>
    </div>
  );
}

export function ClosureHistoryModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(daysAgoKey(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ClosureArchiveRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosureArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    try {
      const data = await edgeApi<{ closure: ClosureArchiveDetail }>(`/api/closure/history/${id}`);
      setDetail(data.closure);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Errore caricamento dettaglio");
    } finally {
      setDetailLoading(false);
    }
  }, []);

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

        {!selectedId ? (
          <>
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
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Z</th>
                      <th className="px-3 py-2 text-right">Totale</th>
                      <th className="px-3 py-2 text-right">Scostamento</th>
                      <th className="px-3 py-2">Cloud</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((row) => (
                      <tr key={row.id} className="border-t border-[hsl(var(--pg-border))]">
                        <td className="px-3 py-2">{row.closureDate}</td>
                        <td className="px-3 py-2">{row.zNumber ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {euro(row.theoretical.total)}
                        </td>
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
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-sm font-medium text-[hsl(var(--pg-primary))] hover:underline"
                            onClick={() => void loadDetail(row.id)}
                          >
                            Dettaglio
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <ClosureDetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onBack={() => {
              setSelectedId(null);
              setDetail(null);
              setDetailError("");
            }}
          />
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            if (selectedId) {
              setSelectedId(null);
              setDetail(null);
              return;
            }
            onClose();
          }}
        >
          {selectedId ? "Indietro" : "Chiudi"}
        </Button>
      </div>
    </div>
  );
}
