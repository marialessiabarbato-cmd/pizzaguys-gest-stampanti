import { Button } from "@pizzaguys/ui";
import type { TableStatus } from "@pizzaguys/types";
import { ComandaHelp } from "../components/ComandaHelp";
import { OrderHeader } from "../components/OrderHeader";
import { courseLabel } from "../lib/course";
import type { LiveTable, Operator, SubmittedLine } from "../lib/types";

export function TableMgmtScreen({
  table,
  operator,
  submittedLines,
  cartDraftCount,
  isOffline,
  message,
  onBack,
  onAddItems,
  onCallCourse,
  onReleaseDessert,
  onRequestPayment,
  onStorno,
}: {
  table: LiveTable;
  operator: Operator;
  submittedLines: SubmittedLine[];
  cartDraftCount: number;
  isOffline: boolean;
  message: string;
  onBack: () => void;
  onAddItems: () => void;
  onCallCourse: (course: number) => void;
  onReleaseDessert: () => void;
  onRequestPayment: () => void;
  onStorno: (line: SubmittedLine) => void;
}) {
  const statusHint: Partial<Record<TableStatus, string>> = {
    BILL_REQUESTED: "Conto richiesto — in attesa della cassa",
    SPLIT_IN_PROGRESS: "Split conto in corso alla cassa",
    OCCUPIED: "Tavolo in servizio",
  };

  const activeLines = submittedLines.filter((l) => l.quantity - (l.voidedQuantity ?? 0) > 0);
  const canPay = !isOffline && activeLines.length > 0 && table.status !== "SPLIT_IN_PROGRESS";

  return (
    <main className="flex min-h-screen flex-col">
      <OrderHeader table={table} operator={operator} backLabel="← Mappa" onBack={onBack} />

      {message && (
        <p className="border-b border-[hsl(var(--pg-border))] px-4 py-2 text-sm">{message}</p>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 rounded-lg bg-[hsl(var(--pg-muted))] px-4 py-3 text-sm">
          {statusHint[table.status] ?? "Gestione tavolo"}
        </p>

        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">In cucina / già inviati</h2>
          {activeLines.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun piatto inviato ancora.</p>
          ) : (
            <ul className="space-y-2">
              {activeLines.map((l) => {
                const remaining = l.quantity - (l.voidedQuantity ?? 0);
                return (
                  <li
                    key={l.lineId}
                    className="flex min-h-14 items-center justify-between rounded-xl border border-[hsl(var(--pg-border))] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg" title="Già inviato">
                        🔒
                      </span>
                      <span className="font-medium">
                        {remaining}× {l.name}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      className="min-h-12 border-red-300 text-red-700"
                      onClick={() => onStorno(l)}
                    >
                      Storno
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">Servizio sala</h2>
          <p className="mb-3 text-sm text-[hsl(var(--pg-muted-foreground))]">
            Sblocca in cucina le portate in HOLD o invia i dolci a fine pasto.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((c) => (
              <Button
                key={c}
                variant="outline"
                className="min-h-14 flex-col text-sm"
                disabled={isOffline}
                onClick={() => onCallCourse(c)}
              >
                <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">CHIAMA</span>
                {courseLabel(c)}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3 min-h-14 w-full"
            disabled={isOffline}
            onClick={onReleaseDessert}
          >
            X DOLCE — invia dessert
          </Button>
        </section>

        <ComandaHelp context="table" />
      </div>

      <div className="sticky bottom-0 space-y-3 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-4">
        <Button size="lg" className="min-h-14 w-full" onClick={onAddItems}>
          {cartDraftCount > 0 ? `Continua comanda (${cartDraftCount})` : "Aggiungi piatti"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-h-14 w-full"
          disabled={!canPay}
          onClick={onRequestPayment}
        >
          RICHIEDI PAGAMENTO
        </Button>
      </div>
    </main>
  );
}
