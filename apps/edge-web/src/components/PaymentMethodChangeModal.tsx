import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "CONTANTI",
  POS: "CARTE",
  MEAL_VOUCHER: "BUONI PASTO",
  SATISPAY: "SATISPAY",
  OTHER: "ALTRO",
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "POS",
  "MEAL_VOUCHER",
  "SATISPAY",
  "OTHER",
];

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function typeLabel(type: FiscalDocumentType) {
  if (type === "INVOICE") return "Fattura";
  if (type === "TRAINING") return "Addestramento";
  return "Scontrino";
}

export function PaymentMethodChangeModal({
  documentNumber,
  documentType,
  tableLabel,
  total,
  currentMethod,
  loading,
  onConfirm,
  onCancel,
}: {
  documentNumber: number;
  documentType: FiscalDocumentType;
  tableLabel: string | null;
  total: number;
  currentMethod: PaymentMethod;
  loading?: boolean;
  onConfirm: (method: PaymentMethod) => void;
  onCancel: () => void;
}) {
  const [nextMethod, setNextMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    setNextMethod(null);
  }, [documentNumber, currentMethod]);

  const canApply = nextMethod != null && nextMethod !== currentMethod;

  return (
    <OffCanvas widthClass="max-w-md" zClass="z-[60]" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h3 className="text-lg font-bold">Cambia metodo di pagamento</h3>
        <p className="mt-1 text-sm text-[hsl(var(--pg-muted-foreground))]">
          Correggi come è stato incassato il documento — es. la carta non è andata e il cliente
          paga in contanti.
        </p>

        <p className="mt-3 text-xs text-[hsl(var(--pg-muted-foreground))]">
          {typeLabel(documentType)} #{documentNumber}
          {tableLabel ? ` · Tavolo ${tableLabel}` : ""}
        </p>

        <div className="mt-4 overflow-hidden rounded-lg border border-[hsl(var(--pg-border))]">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--pg-muted))]/50 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Pagamento registrato</th>
                <th className="px-3 py-2 text-right font-medium">Importo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[hsl(var(--pg-border))]">
                <td className="px-3 py-2.5 font-medium">{PAYMENT_LABELS[currentMethod]}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{euro(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-sm font-medium">Nuovo metodo</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const isCurrent = m === currentMethod;
            const isSelected = m === nextMethod;
            return (
              <Button
                key={m}
                type="button"
                variant={isSelected ? "default" : "outline"}
                className={`h-11 min-h-[44px] text-sm ${isCurrent ? "opacity-60" : ""}`}
                disabled={loading || isCurrent}
                onClick={() => setNextMethod(m)}
              >
                {PAYMENT_LABELS[m]}
                {isCurrent ? " (attuale)" : ""}
              </Button>
            );
          })}
        </div>

        {canApply && nextMethod && (
          <div className="mt-4 rounded-lg border-2 border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/5 px-4 py-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
              Modifica
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums">
              {PAYMENT_LABELS[currentMethod]} → {PAYMENT_LABELS[nextMethod]}
            </p>
            <p className="mt-0.5 text-sm text-[hsl(var(--pg-muted-foreground))]">
              Importo invariato: {euro(total)}
            </p>
          </div>
        )}
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" disabled={loading} onClick={onCancel}>
          Chiudi
        </Button>
        <Button
          className="min-h-12 flex-1"
          disabled={loading || !canApply}
          onClick={() => nextMethod && onConfirm(nextMethod)}
        >
          {loading ? "Salvataggio..." : "Conferma modifica"}
        </Button>
      </div>
    </OffCanvas>
  );
}
