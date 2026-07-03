import type { FiscalDocumentType } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";

interface OrderLine {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function typeLabel(type: FiscalDocumentType) {
  if (type === "INVOICE") return "Fattura";
  if (type === "TRAINING") return "Addestramento";
  return "Scontrino";
}

export function DocumentOrderDetailsModal({
  documentNumber,
  documentType,
  tableLabel,
  issuedAt,
  operatorName,
  lines,
  total,
  onClose,
}: {
  documentNumber: number;
  documentType: FiscalDocumentType;
  tableLabel: string | null;
  issuedAt: string;
  operatorName: string | null;
  lines: OrderLine[];
  total: number;
  onClose: () => void;
}) {
  const issued = new Date(issuedAt);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
        <h3 className="text-lg font-bold">Dettagli ordine</h3>
        <p className="mt-1 text-sm text-[hsl(var(--pg-muted-foreground))]">
          {typeLabel(documentType)} #{documentNumber}
          {tableLabel ? ` · Tavolo ${tableLabel}` : ""}
          {" · "}
          {issued.toLocaleString("it-IT")}
          {operatorName ? ` · ${operatorName}` : ""}
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border border-[hsl(var(--pg-border))]">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--pg-muted))]/50 text-left text-xs">
              <tr>
                <th className="px-3 py-2">Articolo</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-right">Prezzo</th>
                <th className="px-3 py-2 text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
                return (
                  <tr key={`${line.name}-${i}`} className="border-t border-[hsl(var(--pg-border))]">
                    <td className="px-3 py-2">{line.name}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(line.unitPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euro(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[hsl(var(--pg-border))] font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Totale
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{euro(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </div>
  );
}
