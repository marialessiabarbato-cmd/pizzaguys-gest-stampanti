import type { PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi, edgeApiDownload } from "../lib/api";
import { PAYMENT_LABELS } from "./PaymentMethodChangeModal";

type HistoryTab = "fiscal" | "internal";

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

interface BrokerLine {
  broker: string;
  cashAmount: number;
  cardAmount: number;
}

interface ExpenseLine {
  description: string;
  amount: number;
}

interface ExtraLine {
  label: string;
  amount: number;
}

interface InternalClosureRecord {
  id: string;
  closureDate: string;
  closureTotal: number;
  cashWithdrawal: number;
  posTotal: number;
  brokers: BrokerLine[];
  expenses: ExpenseLine[];
  cashFund: number;
  extraLines: ExtraLine[];
  notes?: string;
  operatorName: string;
  emailedAt?: string;
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

function paymentLabel(method: string) {
  return PAYMENT_LABELS[method as PaymentMethod] ?? method;
}

function formatInternalNotebook(record: InternalClosureRecord): string {
  const lines: string[] = [
    record.closureDate,
    `CHIUSURA TOT € ${record.closureTotal.toFixed(2)}`,
    `PRELIEVO CONT € ${record.cashWithdrawal.toFixed(2)}`,
    `POS € ${record.posTotal.toFixed(2)}`,
  ];
  for (const b of record.brokers) {
    const parts: string[] = [];
    if (b.cashAmount > 0) parts.push(`€ ${b.cashAmount.toFixed(2)} (CONT)`);
    if (b.cardAmount > 0) parts.push(`€ ${b.cardAmount.toFixed(2)} (CARTA)`);
    lines.push(`${b.broker.toUpperCase()} ${parts.join(" ; ")}`);
  }
  for (const e of record.expenses) {
    lines.push(`SPESE € ${e.amount.toFixed(2)} (${e.description})`);
  }
  for (const x of record.extraLines) {
    lines.push(`${x.label} € ${x.amount.toFixed(2)}`);
  }
  lines.push(`FONDO CASSA € ${record.cashFund.toFixed(2)}`);
  if (record.notes?.trim()) lines.push(`Note: ${record.notes.trim()}`);
  return lines.join("\n");
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

function InternalDetailPanel({
  detail,
  loading,
  error,
  onBack,
}: {
  detail: InternalClosureRecord | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento dettaglio...</p>
    );
  }
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!detail) return null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="h-9 px-2 text-sm" onClick={onBack}>
        ← Torna all&apos;elenco
      </Button>
      <div>
        <h3 className="text-lg font-bold">Chiusura interna {detail.closureDate}</h3>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          {new Date(detail.createdAt).toLocaleString("it-IT")}
          {detail.operatorName ? ` · ${detail.operatorName}` : ""}
        </p>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {formatInternalNotebook(detail)}
      </pre>
      <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
        {detail.emailedAt
          ? `Email inviata il ${new Date(detail.emailedAt).toLocaleString("it-IT")}`
          : "Email: non inviata"}
      </p>
    </div>
  );
}

export function ClosureHistoryModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<HistoryTab>("fiscal");
  const [from, setFrom] = useState(daysAgoKey(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<ClosureArchiveRow[]>([]);
  const [internalRows, setInternalRows] = useState<InternalClosureRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosureArchiveDetail | null>(null);
  const [internalDetail, setInternalDetail] = useState<InternalClosureRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (tab === "fiscal") {
        const data = await edgeApi<{ closures: ClosureArchiveRow[] }>(
          `/api/closure/history?${params}`,
        );
        setRows(data.closures);
      } else {
        const data = await edgeApi<InternalClosureRecord[]>(
          `/api/internal-closure/history?${params}`,
        );
        setInternalRows(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setRows([]);
      setInternalRows([]);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [from, to, tab]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setInternalDetail(null);
    try {
      const data = await edgeApi<{ closure: ClosureArchiveDetail }>(`/api/closure/history/${id}`);
      setDetail(data.closure);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Errore caricamento dettaglio");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadInternalDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setInternalDetail(null);
    try {
      const data = await edgeApi<InternalClosureRecord>(`/api/internal-closure/history/${id}`);
      setInternalDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Errore caricamento dettaglio");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setInternalDetail(null);
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

  const clearSelection = () => {
    setSelectedId(null);
    setDetail(null);
    setInternalDetail(null);
    setDetailError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Storico chiusure locali</h2>

        {!selectedId && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button
              variant={tab === "fiscal" ? "default" : "outline"}
              className="h-10"
              onClick={() => setTab("fiscal")}
            >
              Fiscali
            </Button>
            <Button
              variant={tab === "internal" ? "default" : "outline"}
              className="h-10"
              onClick={() => setTab("internal")}
            >
              Interne
            </Button>
          </div>
        )}

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
              {tab === "fiscal" && (
                <Button onClick={() => void downloadCsv()} disabled={csvLoading}>
                  Scarica CSV
                </Button>
              )}
            </div>

            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

            {loading ? (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
            ) : tab === "fiscal" ? (
              rows.length === 0 ? (
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
              )
            ) : internalRows.length === 0 ? (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Nessuna chiusura interna nel periodo.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))]">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-right">Totale</th>
                      <th className="px-3 py-2 text-right">Prelievo</th>
                      <th className="px-3 py-2">Operatore</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {internalRows.map((row) => (
                      <tr key={row.id} className="border-t border-[hsl(var(--pg-border))]">
                        <td className="px-3 py-2">{row.closureDate}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {euro(row.closureTotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {euro(row.cashWithdrawal)}
                        </td>
                        <td className="px-3 py-2">{row.operatorName}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-sm font-medium text-[hsl(var(--pg-primary))] hover:underline"
                            onClick={() => void loadInternalDetail(row.id)}
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
        ) : tab === "internal" ? (
          <InternalDetailPanel
            detail={internalDetail}
            loading={detailLoading}
            error={detailError}
            onBack={clearSelection}
          />
        ) : (
          <ClosureDetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onBack={clearSelection}
          />
        )}

        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => {
            if (selectedId) {
              clearSelection();
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
