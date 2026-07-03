import type { FiscalDocumentType, InvoiceCustomer, LocationMealVoucherPreset, PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { PaymentPad, parsePaymentAmount } from "./PaymentPad";
import { EMPTY_INVOICE_CUSTOMER, InvoiceCustomerForm, isInvoiceCustomerValid } from "./InvoiceCustomerForm";
import { InvoiceCustomerPickerModal } from "./InvoiceCustomerPickerModal";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "CASH", label: "Contanti" },
  { id: "POS", label: "POS / Carta" },
  { id: "MEAL_VOUCHER", label: "Buoni pasto" },
  { id: "SATISPAY", label: "Satispay" },
  { id: "OTHER", label: "Altro" },
];

const DOC_TYPES: { id: FiscalDocumentType; label: string }[] = [
  { id: "RECEIPT", label: "Scontrino" },
  { id: "INVOICE", label: "Fattura" },
  { id: "TRAINING", label: "Addestramento" },
];

const DEFAULT_VOUCHER_PRESETS: LocationMealVoucherPreset[] = [
  { id: "d-7", label: "€ 7", amount: 7, sortOrder: 0, isActive: true },
  { id: "d-8", label: "€ 8", amount: 8, sortOrder: 1, isActive: true },
  { id: "d-10", label: "€ 10", amount: 10, sortOrder: 2, isActive: true },
];

export function PaymentModal({
  title,
  amount,
  method,
  onMethod,
  documentType,
  onDocumentType,
  invoiceCustomer,
  onInvoiceCustomer,
  fullMealReceipt,
  onFullMealReceipt,
  fullMealAvailable = true,
  cashAmount,
  onCashAmount,
  mealVoucherPresets = [],
  mealVoucherAmount,
  onMealVoucherAmount,
  remainderMethod,
  onRemainderMethod,
  remainderCashAmount,
  onRemainderCashAmount,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  amount: number;
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  documentType: FiscalDocumentType;
  onDocumentType: (d: FiscalDocumentType) => void;
  invoiceCustomer: InvoiceCustomer;
  onInvoiceCustomer: (customer: InvoiceCustomer) => void;
  fullMealReceipt: boolean;
  onFullMealReceipt: (value: boolean) => void;
  fullMealAvailable?: boolean;
  cashAmount: string;
  onCashAmount: (v: string) => void;
  mealVoucherPresets?: LocationMealVoucherPreset[];
  mealVoucherAmount: string;
  onMealVoucherAmount: (v: string) => void;
  remainderMethod: "CASH" | "POS";
  onRemainderMethod: (m: "CASH" | "POS") => void;
  remainderCashAmount: string;
  onRemainderCashAmount: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const presets = useMemo(() => {
    const active = mealVoucherPresets.filter((p) => p.isActive);
    return active.length > 0 ? active : DEFAULT_VOUCHER_PRESETS;
  }, [mealVoucherPresets]);

  const voucherValue = parsePaymentAmount(mealVoucherAmount);
  const remainder = Math.max(0, Math.round((amount - voucherValue) * 100) / 100);
  const isMealVoucher = method === "MEAL_VOUCHER";
  const isMixed = isMealVoucher && remainder > 0.009;

  const cashOk =
    method === "CASH"
      ? parsePaymentAmount(cashAmount) >= amount
      : isMealVoucher
        ? voucherValue > 0 &&
          voucherValue <= amount + 0.001 &&
          (remainder <= 0.009 ||
            (remainderMethod === "POS" ||
              parsePaymentAmount(remainderCashAmount) >= remainder))
        : true;
  const invoiceOk = documentType !== "INVOICE" || isInvoiceCustomerValid(invoiceCustomer);
  const canConfirm = cashOk && invoiceOk && documentType !== "INVOICE";

  return (
    <>
      {showCustomerPicker && (
        <InvoiceCustomerPickerModal
          initialCustomer={invoiceCustomer}
          onCancel={() => setShowCustomerPicker(false)}
          onConfirm={(customer) => {
            onInvoiceCustomer(customer);
            setShowCustomerPicker(false);
          }}
        />
      )}

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

        {isMealVoucher && (
          <div className="mb-4 space-y-3 rounded-xl border border-[hsl(var(--pg-border))] p-3">
            <p className="text-sm font-medium">Importo buono pasto</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className="h-10 min-w-[4.5rem] text-sm"
                  onClick={() => onMealVoucherAmount(String(p.amount))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <PaymentPad
              amount={mealVoucherAmount}
              onChange={onMealVoucherAmount}
              total={amount}
            />
            {remainder > 0.009 && (
              <>
                <p className="text-center text-sm font-semibold text-[hsl(var(--pg-primary))]">
                  Resto da pagare: € {remainder.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">Saldo con:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={remainderMethod === "CASH" ? "default" : "outline"}
                    className="h-10"
                    onClick={() => onRemainderMethod("CASH")}
                  >
                    Contanti
                  </Button>
                  <Button
                    type="button"
                    variant={remainderMethod === "POS" ? "default" : "outline"}
                    className="h-10"
                    onClick={() => onRemainderMethod("POS")}
                  >
                    POS / Carta
                  </Button>
                </div>
                {remainderMethod === "CASH" && (
                  <PaymentPad
                    amount={remainderCashAmount}
                    onChange={onRemainderCashAmount}
                    total={remainder}
                  />
                )}
              </>
            )}
          </div>
        )}

        {!isMealVoucher && (
          <>
        <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">Documento fiscale</p>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {DOC_TYPES.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant={documentType === d.id ? "default" : "outline"}
              className="h-10 min-h-[40px] text-xs"
              onClick={() => {
                onDocumentType(d.id);
                if (d.id !== "INVOICE") {
                  onInvoiceCustomer(EMPTY_INVOICE_CUSTOMER);
                }
                if (d.id !== "RECEIPT") {
                  onFullMealReceipt(false);
                }
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
          </>
        )}

        {documentType === "INVOICE" && !isMealVoucher && (
          <>
            <Button
              type="button"
              variant="outline"
              className="mb-3 h-11 w-full"
              disabled={loading}
              onClick={() => setShowCustomerPicker(true)}
            >
              Intesta documento / Rubrica clienti
            </Button>
            <InvoiceCustomerForm
              value={invoiceCustomer}
              onChange={onInvoiceCustomer}
              disabled={loading}
            />
          </>
        )}

        {documentType === "RECEIPT" && fullMealAvailable && !isMealVoucher && (
          <label className="mb-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-4 py-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={fullMealReceipt}
              disabled={loading}
              onChange={(e) => onFullMealReceipt(e.target.checked)}
            />
            <span className="text-sm leading-snug">
              <span className="font-medium">Scontrino come &quot;Pasto completo&quot;</span>
              <span className="mt-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">
                Una sola riga fiscale al totale (dettaglio piatti resta nel gestionale).
              </span>
            </span>
          </label>
        )}

        {method === "CASH" && !isMealVoucher && (
          <PaymentPad amount={cashAmount} onChange={onCashAmount} total={amount} />
        )}

        {isMixed && (
          <p className="mb-3 text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
            Pagamento misto: buono € {voucherValue.toFixed(2)} +{" "}
            {remainderMethod === "CASH" ? "contanti" : "POS"} € {remainder.toFixed(2)}
          </p>
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
    </>
  );
}
