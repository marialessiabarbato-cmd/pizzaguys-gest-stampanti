import type { PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { PaymentPad, parsePaymentAmount } from "./PaymentPad";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Contanti" },
  { id: "POS", label: "POS / Carta" },
  { id: "MEAL_VOUCHER", label: "Buoni pasto" },
  { id: "SATISPAY", label: "Satispay" },
  { id: "OTHER", label: "Altro" },
];

export function PaymentModal({
  title,
  amount,
  method,
  onMethod,
  cashAmount,
  onCashAmount,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  amount: number;
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  cashAmount: string;
  onCashAmount: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const canConfirm =
    method !== "CASH" || parsePaymentAmount(cashAmount) >= amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-2 text-center text-lg font-bold">{title}</h2>
        <p className="mb-4 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
          Importo € {amount.toFixed(2)}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant={method === m.id ? "default" : "outline"}
              className="h-12 min-h-[48px] text-sm"
              onClick={() => onMethod(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>

        {method === "CASH" && (
          <PaymentPad amount={cashAmount} onChange={onCashAmount} total={amount} />
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            className="h-12 flex-1 text-base"
            disabled={loading || !canConfirm}
            onClick={onConfirm}
          >
            Conferma
          </Button>
        </div>
      </div>
    </div>
  );
}
