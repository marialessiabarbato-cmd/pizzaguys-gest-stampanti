import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "../lib/api";

interface CloseReport {
  theoretical: { cash: number; pos: number; total: number; transactionCount: number };
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
  reportPath?: string;
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
  const [cashDeclared, setCashDeclared] = useState("");
  const [posDeclared, setPosDeclared] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<CloseReport | null>(null);

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
              <span>Teorico</span>
              <span>Dichiarato</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span>Contanti</span>
              <span className="tabular-nums">€ {report.theoretical.cash.toFixed(2)}</span>
              <span className="tabular-nums">€ {report.declared.cash.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span>POS</span>
              <span className="tabular-nums">€ {report.theoretical.pos.toFixed(2)}</span>
              <span className="tabular-nums">€ {report.declared.pos.toFixed(2)}</span>
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
              Scostamento totale: € {disc.total.toFixed(2)}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-bold">Chiusura turno — conteggio cieco</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
          Conta fisicamente contanti e POS. I totali teorici non sono mostrati prima della conferma.
        </p>
        <label className="mb-3 block text-sm">
          Contanti in cassa (€)
          <input
            type="text"
            inputMode="decimal"
            value={cashDeclared}
            onChange={(e) => setCashDeclared(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--pg-border))] px-3 py-3 text-lg"
            placeholder="0,00"
          />
        </label>
        <label className="mb-4 block text-sm">
          Totale POS da terminale (€)
          <input
            type="text"
            inputMode="decimal"
            value={posDeclared}
            onChange={(e) => setPosDeclared(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[hsl(var(--pg-border))] px-3 py-3 text-lg"
            placeholder="0,00"
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Annulla
          </Button>
          <Button className="h-12 flex-1" disabled={loading} onClick={() => void submit()}>
            Conferma
          </Button>
        </div>
      </div>
    </div>
  );
}
