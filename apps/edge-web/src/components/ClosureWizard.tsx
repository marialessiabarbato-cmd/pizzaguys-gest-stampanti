import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";

type Step = "precheck" | "zreport" | "reconcile" | "done";

interface Theoretical {
  cash: number;
  pos: number;
  total: number;
  transactionCount: number;
  byPaymentMethod: Record<string, number>;
}

interface PreCheck {
  canClose: boolean;
  blockers: string[];
  openTables: Array<{ tableId: string; status: string }>;
  zReportIssued: boolean;
  theoretical: Theoretical;
}

interface ReconcileResult {
  theoretical: Theoretical;
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
}

export function ClosureWizard({
  operatorId,
  operatorName,
  onClose,
}: {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("precheck");
  const [preCheck, setPreCheck] = useState<PreCheck | null>(null);
  const [cashDeclared, setCashDeclared] = useState("");
  const [posDeclared, setPosDeclared] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zNumber, setZNumber] = useState<number | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);

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
        body: JSON.stringify({
          cashDeclared: Number.parseFloat(cashDeclared.replace(",", ".")) || 0,
          posDeclared: Number.parseFloat(posDeclared.replace(",", ".")) || 0,
        }),
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
      await edgeApi("/api/closure/complete", {
        method: "POST",
        body: JSON.stringify({
          cashDeclared: Number.parseFloat(cashDeclared.replace(",", ".")) || 0,
          posDeclared: Number.parseFloat(posDeclared.replace(",", ".")) || 0,
          operatorId,
          operatorName,
        }),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore chiusura");
    } finally {
      setLoading(false);
    }
  };

  const theoretical = reconcile?.theoretical ?? preCheck?.theoretical;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Chiusura giornaliera</h2>

        {step === "precheck" && preCheck && (
          <div className="space-y-4">
            {preCheck.canClose ? (
              <p className="text-sm text-green-600">Sala pronta per la chiusura.</p>
            ) : (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700">
                <p className="font-medium">Blocchi attivi:</p>
                <ul className="mt-1 list-inside list-disc">
                  {preCheck.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {theoretical && (
              <div className="rounded-lg border border-[hsl(var(--pg-border))] p-3 text-sm">
                <p className="mb-2 font-medium">Totali teorici giornata</p>
                <div className="grid grid-cols-2 gap-2">
                  <span>Contanti</span>
                  <span className="text-right tabular-nums">€ {theoretical.cash.toFixed(2)}</span>
                  <span>POS</span>
                  <span className="text-right tabular-nums">€ {theoretical.pos.toFixed(2)}</span>
                  <span className="font-semibold">Totale</span>
                  <span className="text-right font-semibold tabular-nums">
                    € {theoretical.total.toFixed(2)}
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
                Z mock #{zNumber} emessa
              </p>
            )}

            {theoretical && !reconcile && (
              <div className="rounded-lg bg-[hsl(var(--pg-muted))]/40 p-3 text-sm">
                <p className="mb-2 font-medium">Riepilogo teorico (calcolato dalla cassa)</p>
                <div className="grid grid-cols-2 gap-1">
                  <span>Contanti teorici</span>
                  <span className="text-right tabular-nums">€ {theoretical.cash.toFixed(2)}</span>
                  <span>POS teorico</span>
                  <span className="text-right tabular-nums">€ {theoretical.pos.toFixed(2)}</span>
                  <span>Totale teorico</span>
                  <span className="text-right tabular-nums">€ {theoretical.total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <p className="text-sm">Conteggio cieco — inserisci i valori reali:</p>
            <label className="block text-sm">
              Contanti (€)
              <input
                className="mt-1 w-full rounded-lg border px-3 py-3 text-lg"
                value={cashDeclared}
                onChange={(e) => setCashDeclared(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              POS (€)
              <input
                className="mt-1 w-full rounded-lg border px-3 py-3 text-lg"
                value={posDeclared}
                onChange={(e) => setPosDeclared(e.target.value)}
              />
            </label>

            {reconcile && (
              <div className="space-y-2 rounded-lg border border-[hsl(var(--pg-border))] p-3 text-sm">
                <div className="grid grid-cols-3 gap-2 border-b border-[hsl(var(--pg-border))] pb-2 font-medium">
                  <span />
                  <span className="text-right">Teorico</span>
                  <span className="text-right">Dichiarato</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span>Contanti</span>
                  <span className="text-right tabular-nums">€ {reconcile.theoretical.cash.toFixed(2)}</span>
                  <span className="text-right tabular-nums">€ {reconcile.declared.cash.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span>POS</span>
                  <span className="text-right tabular-nums">€ {reconcile.theoretical.pos.toFixed(2)}</span>
                  <span className="text-right tabular-nums">€ {reconcile.declared.pos.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-semibold">
                  <span>Totale</span>
                  <span className="text-right tabular-nums">€ {reconcile.theoretical.total.toFixed(2)}</span>
                  <span className="text-right tabular-nums">
                    € {(reconcile.declared.cash + reconcile.declared.pos).toFixed(2)}
                  </span>
                </div>
                <div
                  className={`rounded-lg p-3 text-center font-bold ${
                    reconcile.discrepancy.total < 0
                      ? "bg-red-500/10 text-red-600"
                      : reconcile.discrepancy.total > 0
                        ? "bg-orange-500/10 text-orange-600"
                        : "bg-green-500/10 text-green-600"
                  }`}
                >
                  Scostamento: € {reconcile.discrepancy.total.toFixed(2)}
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
                  Verifica
                </Button>
              ) : (
                <Button className="flex-1" disabled={loading} onClick={() => void complete()}>
                  Chiudi giornata
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-lg font-bold text-green-600">Giornata chiusa</p>
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Sala resettata. Report in tmp/prints/
            </p>
            <Button className="w-full" onClick={onClose}>
              OK
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
