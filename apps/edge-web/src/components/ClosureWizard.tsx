import { CASH_SERVICE_LABELS, type CashSession } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi, edgeApiDownload } from "../lib/api";

type Step = "precheck" | "zreport" | "reconcile" | "done";

interface Theoretical {
  cash: number;
  pos: number;
  total: number;
  transactionCount: number;
  byPaymentMethod: Record<string, number>;
}

interface DaySessions {
  sessions: CashSession[];
  cashSales: number;
  posSales: number;
  withdrawals: number;
  expenses: number;
  cashDeclared: number;
  posDeclared: number;
  discrepancyCash: number;
  discrepancyPos: number;
  discrepancyTotal: number;
}

interface PreCheck {
  canClose: boolean;
  blockers: string[];
  openTables: Array<{ tableId: string; status: string }>;
  pendingPayments?: Array<{ requestId: string; tableLabel: string; total: number }>;
  openCashSession?: { id: string; service: "LUNCH" | "DINNER" } | null;
  closureDate?: string;
  cashSessions?: DaySessions;
  zReportIssued: boolean;
  theoretical: Theoretical;
}

interface ReconcileResult {
  theoretical: Theoretical;
  cashSessions: DaySessions;
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
}

interface ClosureRecord {
  id: string;
  closureDate: string;
  zNumber?: number;
  theoretical: Theoretical;
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
  operatorName: string;
  syncedAt?: string;
  createdAt: string;
}

interface CompleteResult {
  closure: ClosureRecord;
  syncError?: string;
  syncQueued: boolean;
  tablesReset: number;
  dailyReportPath?: string;
  dailyReportHtml?: string;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export function ClosureWizard({
  operatorId,
  operatorName,
  onClose,
  onCloseCash,
}: {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
  /** Apre la chiusura della cassa ancora aperta (solo operatore cassa). */
  onCloseCash?: () => void;
}) {
  const [step, setStep] = useState<Step>("precheck");
  const [preCheck, setPreCheck] = useState<PreCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zNumber, setZNumber] = useState<number | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [completeResult, setCompleteResult] = useState<CompleteResult | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const loadPreCheck = useCallback(async () => {
    const data = await edgeApi<PreCheck>("/api/closure/pre-check");
    setPreCheck(data);
    if (data.zReportIssued) setStep("reconcile");
  }, []);

  useEffect(() => {
    void loadPreCheck();
  }, [loadPreCheck]);

  const emitZ = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await edgeApi<{ zNumber: number }>("/api/closure/z-report", {
        method: "POST",
      });
      setZNumber(result.zNumber);
      setStep("reconcile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore Z");
    } finally {
      setLoading(false);
    }
  };

  const previewReconcile = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await edgeApi<ReconcileResult>("/api/closure/reconcile", {
        method: "POST",
      });
      setReconcile(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore riconciliazione");
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await edgeApi<CompleteResult>("/api/closure/complete", {
        method: "POST",
        body: JSON.stringify({
          operatorId,
          operatorName,
        }),
      });
      setCompleteResult(result);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore chiusura");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    setCsvLoading(true);
    setError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      await edgeApiDownload(`/api/closure/export.csv?to=${today}`, `chiusure-${today}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore export CSV");
    } finally {
      setCsvLoading(false);
    }
  };

  const theoretical = reconcile?.theoretical ?? preCheck?.theoretical;
  const closure = completeResult?.closure;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Chiusura giornaliera</h2>

        {step === "precheck" && preCheck && (
          <div className="space-y-4">
            {preCheck.canClose ? (
              <p className="text-sm text-green-600">Sala pronta per la chiusura.</p>
            ) : (
              <div className="space-y-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-700">
                <p className="font-medium">Prima di chiudere la giornata risolvi:</p>
                <ul className="list-inside list-disc space-y-1">
                  {preCheck.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>

                {preCheck.openCashSession && (
                  <div className="rounded-lg border border-red-300/60 bg-[hsl(var(--pg-background))] p-3 text-[hsl(var(--pg-foreground))]">
                    <p className="font-medium">
                      Cassa {CASH_SERVICE_LABELS[preCheck.openCashSession.service].toLowerCase()} aperta
                    </p>
                    <p className="mt-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                      Chiudi la cassa (conteggio contanti, POS e prelievi), poi riapri la chiusura
                      giornata.
                    </p>
                    {onCloseCash && (
                      <Button
                        variant="outline"
                        className="mt-3 h-10 w-full"
                        onClick={() => {
                          onClose();
                          onCloseCash();
                        }}
                      >
                        Chiudi cassa ora
                      </Button>
                    )}
                  </div>
                )}

                {preCheck.openTables.length > 0 && (
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {preCheck.openTables.length} tavolo/i con conto aperto: incassa o annulla gli
                    ordini prima di procedere.
                  </p>
                )}

                {(preCheck.pendingPayments?.length ?? 0) > 0 && (
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {preCheck.pendingPayments!.length} richiesta/e di pagamento in attesa: usa la
                    barra gialla in alto per incassare.
                  </p>
                )}
              </div>
            )}

            {theoretical && (
              <div className="rounded-lg border border-[hsl(var(--pg-border))] p-3 text-sm">
                <p className="mb-2 font-medium">Totali teorici giornata</p>
                <div className="grid grid-cols-2 gap-2">
                  <span>Contanti</span>
                  <span className="text-right tabular-nums">{euro(theoretical.cash)}</span>
                  <span>POS</span>
                  <span className="text-right tabular-nums">{euro(theoretical.pos)}</span>
                  <span className="font-semibold">Totale</span>
                  <span className="text-right font-semibold tabular-nums">
                    {euro(theoretical.total)}
                  </span>
                  <span>Transazioni</span>
                  <span className="text-right">{theoretical.transactionCount}</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Annulla
              </Button>
              <Button
                className="flex-1"
                disabled={!preCheck.canClose || loading}
                onClick={() => void emitZ()}
              >
                Emetti Z mock
              </Button>
            </div>
          </div>
        )}

        {step === "reconcile" && (
          <div className="space-y-4">
            {zNumber != null && (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Z mock #{zNumber} emessa — report in tmp/prints/
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() =>
                  window.open(
                    `${import.meta.env.VITE_EDGE_API_URL ?? "http://localhost:4100"}/api/closure/daily-report.html`,
                    "_blank",
                  )
                }
              >
                Anteprima report
              </Button>
            </div>

            {theoretical && !reconcile && (
              <div className="rounded-lg bg-[hsl(var(--pg-muted))]/40 p-3 text-sm">
                <p className="mb-2 font-medium">Riepilogo teorico (calcolato dalla cassa)</p>
                <div className="grid grid-cols-2 gap-1">
                  <span>Contanti teorici</span>
                  <span className="text-right tabular-nums">{euro(theoretical.cash)}</span>
                  <span>POS teorico</span>
                  <span className="text-right tabular-nums">{euro(theoretical.pos)}</span>
                  <span>Totale teorico</span>
                  <span className="text-right tabular-nums">{euro(theoretical.total)}</span>
                </div>
              </div>
            )}

            <p className="text-sm">
              Contanti e POS sono già stati contati alla chiusura di ogni cassa: qui trovi la
              quadratura della giornata.
            </p>

            {reconcile && (
              <div className="space-y-2 rounded-lg border border-[hsl(var(--pg-border))] p-3 text-sm">
                <div className="grid grid-cols-4 gap-2 border-b border-[hsl(var(--pg-border))] pb-2 font-medium">
                  <span>Servizio</span>
                  <span className="text-right">Incassato</span>
                  <span className="text-right">Contanti</span>
                  <span className="text-right">POS</span>
                </div>
                {reconcile.cashSessions.sessions.length === 0 && (
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    Nessuna sessione di cassa chiusa per questa giornata.
                  </p>
                )}
                {[...reconcile.cashSessions.sessions]
                  .sort((x, y) => x.openedAt.localeCompare(y.openedAt))
                  .map((session) => (
                    <div key={session.id} className="grid grid-cols-4 gap-2">
                      <span>{CASH_SERVICE_LABELS[session.service]}</span>
                      <span className="text-right tabular-nums">
                        {euro(session.theoretical?.totalSales ?? 0)}
                      </span>
                      <span
                        className={`text-right tabular-nums ${
                          (session.discrepancyCash ?? 0) < 0
                            ? "text-red-600"
                            : (session.discrepancyCash ?? 0) > 0
                              ? "text-orange-600"
                              : ""
                        }`}
                      >
                        {euro(session.discrepancyCash ?? 0)}
                      </span>
                      <span
                        className={`text-right tabular-nums ${
                          (session.discrepancyPos ?? 0) < 0
                            ? "text-red-600"
                            : (session.discrepancyPos ?? 0) > 0
                              ? "text-orange-600"
                              : ""
                        }`}
                      >
                        {euro(session.discrepancyPos ?? 0)}
                      </span>
                    </div>
                  ))}
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Prelievi del giorno {euro(reconcile.cashSessions.withdrawals)} · spese{" "}
                  {euro(reconcile.cashSessions.expenses)}
                </p>
                <div
                  className={`rounded-lg p-3 text-center font-bold ${
                    reconcile.discrepancy.total < 0
                      ? "bg-red-500/10 text-red-600"
                      : reconcile.discrepancy.total > 0
                        ? "bg-orange-500/10 text-orange-600"
                        : "bg-green-500/10 text-green-600"
                  }`}
                >
                  Scostamento giornata: {euro(reconcile.discrepancy.total)}
                </div>
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Transazioni: {reconcile.theoretical.transactionCount}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Annulla
              </Button>
              {!reconcile ? (
                <Button className="flex-1" disabled={loading} onClick={() => void previewReconcile()}>
                  Mostra quadratura
                </Button>
              ) : (
                <Button className="flex-1" disabled={loading} onClick={() => void complete()}>
                  Chiudi giornata
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "done" && closure && completeResult && (
          <div className="space-y-4">
            <p className="text-center text-lg font-bold text-green-600">Giornata chiusa</p>

            <div className="rounded-lg border border-[hsl(var(--pg-border))] p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span>Data</span>
                <span className="text-right">{closure.closureDate}</span>
                {closure.zNumber != null && (
                  <>
                    <span>Chiusura Z</span>
                    <span className="text-right">#{closure.zNumber}</span>
                  </>
                )}
                <span>Totale</span>
                <span className="text-right tabular-nums">{euro(closure.theoretical.total)}</span>
                <span>Scostamento</span>
                <span
                  className={`text-right tabular-nums ${
                    closure.discrepancy.total !== 0 ? "font-medium text-orange-600" : ""
                  }`}
                >
                  {euro(closure.discrepancy.total)}
                </span>
                <span>Tavoli resettati</span>
                <span className="text-right">{completeResult.tablesReset}</span>
              </div>
            </div>

            <div
              className={`rounded-lg p-3 text-sm ${
                completeResult.syncQueued
                  ? "bg-yellow-500/10 text-yellow-800"
                  : closure.syncedAt
                    ? "bg-green-500/10 text-green-700"
                    : "bg-[hsl(var(--pg-muted))]/40 text-[hsl(var(--pg-muted-foreground))]"
              }`}
            >
              {closure.syncedAt ? (
                <p>
                  <strong>Sync cloud:</strong> completata alle{" "}
                  {new Date(closure.syncedAt).toLocaleString("it-IT")}
                </p>
              ) : completeResult.syncQueued ? (
                <p>
                  <strong>Sync cloud:</strong> in coda — verrà ritentata automaticamente.
                  {completeResult.syncError ? ` (${completeResult.syncError})` : ""}
                </p>
              ) : (
                <p>
                  <strong>Sync cloud:</strong> non configurata (edge senza token API).
                </p>
              )}
            </div>

            <p className="text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
              Report giornaliero salvato in tmp/prints/
              {completeResult.dailyReportPath ? (
                <>
                  <br />
                  <span className="break-all">{completeResult.dailyReportPath}</span>
                </>
              ) : null}
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={csvLoading}
                onClick={() => void downloadCsv()}
              >
                Scarica CSV
              </Button>
              <Button className="flex-1" onClick={onClose}>
                OK
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
