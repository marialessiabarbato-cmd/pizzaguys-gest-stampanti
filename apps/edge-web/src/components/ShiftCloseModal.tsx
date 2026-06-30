import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";

interface Theoretical {
  cash: number;
  pos: number;
  total: number;
  transactionCount: number;
}

interface ShiftSummary {
  staffName: string;
  theoretical: Theoretical;
  canClose: boolean;
  openTables: Array<{ tableId: string; status: string }>;
}

interface CloseReport {
  theoretical: Theoretical;
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
  reportPath?: string;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function formatInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function ShiftCloseModal({
  shiftId,
  onClose,
  onComplete,
}: {
  shiftId: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [cashDeclared, setCashDeclared] = useState("");
  const [posDeclared, setPosDeclared] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<CloseReport | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const data = await edgeApi<ShiftSummary>(`/api/shifts/${shiftId}/summary`);
      setSummary(data);
      setCashDeclared(formatInput(data.theoretical.cash));
      setPosDeclared(formatInput(data.theoretical.pos));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Errore caricamento turno");
    } finally {
      setSummaryLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const applyCalculated = () => {
    if (!summary) return;
    setCashDeclared(formatInput(summary.theoretical.cash));
    setPosDeclared(formatInput(summary.theoretical.pos));
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await edgeApi<{ report: CloseReport }>(`/api/shifts/${shiftId}/close-blind`, {
        method: "POST",
        body: JSON.stringify({
          cashDeclared: Number.parseFloat(cashDeclared.replace(",", ".")) || 0,
          posDeclared: Number.parseFloat(posDeclared.replace(",", ".")) || 0,
        }),
      });
      setReport(result.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore chiusura");
    } finally {
      setLoading(false);
    }
  };

  if (report) {
    const disc = report.discrepancy;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-bold">Riconciliazione turno</h2>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 border-b border-[hsl(var(--pg-border))] pb-2 font-medium">
              <span />
              <span>Calcolato</span>
              <span>Confermato</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span>Contanti</span>
              <span className="tabular-nums">{euro(report.theoretical.cash)}</span>
              <span className="tabular-nums">{euro(report.declared.cash)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span>POS</span>
              <span className="tabular-nums">{euro(report.theoretical.pos)}</span>
              <span className="tabular-nums">{euro(report.declared.pos)}</span>
            </div>
            <div
              className={`rounded-lg p-3 text-center font-bold ${
                disc.total < 0
                  ? "bg-red-500/10 text-red-600"
                  : disc.total > 0
                    ? "bg-orange-500/10 text-orange-600"
                    : "bg-green-500/10 text-green-600"
              }`}
            >
              Scostamento totale: {euro(disc.total)}
            </div>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              Transazioni: {report.theoretical.transactionCount}
            </p>
          </div>
          <Button className="mt-6 w-full" onClick={onComplete}>
            Chiudi turno
          </Button>
        </div>
      </div>
    );
  }

  if (summaryLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-6 text-center shadow-xl">
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Calcolo totali turno…</p>
        </div>
      </div>
    );
  }

  if (summaryError || !summary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
          <p className="mb-4 text-sm text-red-500">{summaryError || "Turno non disponibile"}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Annulla
            </Button>
            <Button className="flex-1" onClick={() => void loadSummary()}>
              Riprova
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { theoretical } = summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold">Chiusura turno</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
          {summary.staffName} · totali calcolati dagli incassi registrati
        </p>

        {!summary.canClose && (
          <div className="mb-4 rounded-lg bg-orange-500/10 p-3 text-sm text-orange-700">
            Attenzione: ci sono ancora tavoli/conti aperti in sala.
          </div>
        )}

        <div className="mb-4 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 p-3 text-sm">
          <p className="mb-2 font-medium">Calcolo automatico</p>
          <div className="grid grid-cols-2 gap-1">
            <span>Contanti</span>
            <span className="text-right tabular-nums font-semibold">{euro(theoretical.cash)}</span>
            <span>POS</span>
            <span className="text-right tabular-nums font-semibold">{euro(theoretical.pos)}</span>
            <span>Totale</span>
            <span className="text-right tabular-nums font-semibold">{euro(theoretical.total)}</span>
            <span>Transazioni</span>
            <span className="text-right">{theoretical.transactionCount}</span>
          </div>
        </div>

        <p className="mb-3 text-xs text-[hsl(var(--pg-muted-foreground))]">
          I campi sotto sono già compilati col calcolo. Modificali solo se il conteggio fisico è diverso.
        </p>

        <label className="mb-3 block text-sm">
          Contanti (€)
          <input
            type="text"
            inputMode="decimal"
            value={cashDeclared}
            onChange={(e) => setCashDeclared(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--pg-border))] px-3 py-3 text-lg"
          />
        </label>
        <label className="mb-4 block text-sm">
          POS (€)
          <input
            type="text"
            inputMode="decimal"
            value={posDeclared}
            onChange={(e) => setPosDeclared(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--pg-border))] px-3 py-3 text-lg"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button className="h-12 w-full" disabled={loading} onClick={() => void submit()}>
            Chiudi turno
          </Button>
          <Button variant="outline" className="w-full" disabled={loading} onClick={applyCalculated}>
            Ripristina calcolo sistema
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Annulla
          </Button>
        </div>
      </div>
    </div>
  );
}
