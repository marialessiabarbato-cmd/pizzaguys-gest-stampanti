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

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function paymentConfirmHint({
  method,
  documentType,
  invoiceCustomer,
  cashAmount,
  amount,
  mealVoucherAmount,
  remainder,
  remainderMethod,
  remainderCashAmount,
}: {
  method: PaymentMethod;
  documentType: FiscalDocumentType;
  invoiceCustomer: InvoiceCustomer;
  cashAmount: string;
  amount: number;
  mealVoucherAmount: string;
  remainder: number;
  remainderMethod: "CASH" | "POS";
  remainderCashAmount: string;
}): string | null {
  if (documentType === "INVOICE" && !isInvoiceCustomerValid(invoiceCustomer)) {
    return "Completa i dati cliente per emettere la fattura.";
  }
  if (method === "CASH" && parsePaymentAmount(cashAmount) < amount) {
    return "Inserisci l'importo ricevuto (deve coprire il totale).";
  }
  if (method === "MEAL_VOUCHER") {
    const voucher = parsePaymentAmount(mealVoucherAmount);
    if (voucher <= 0) return "Inserisci l'importo del buono pasto.";
    if (voucher > amount + 0.001) return "L'importo del buono supera il totale.";
    if (remainder > 0.009 && remainderMethod === "CASH" && parsePaymentAmount(remainderCashAmount) < remainder) {
      return "Inserisci i contanti per il saldo residuo.";
    }
  }
  return null;
}

export function PaymentScreen({
  title,
  tableLabel,
  billLines = [],
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
  tableLabel?: string;
  billLines?: Array<{ name: string; quantity: number; lineTotal: number }>;
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
            remainderMethod === "POS" ||
            parsePaymentAmount(remainderCashAmount) >= remainder)
        : true;
  const invoiceOk = documentType !== "INVOICE" || isInvoiceCustomerValid(invoiceCustomer);
  const canConfirm = cashOk && invoiceOk;
  const confirmHint = paymentConfirmHint({
    method,
    documentType,
    invoiceCustomer,
    cashAmount,
    amount,
    mealVoucherAmount,
    remainder,
    remainderMethod,
    remainderCashAmount,
  });

  const showCashPad = method === "CASH" && !isMealVoucher;
  const showVoucherPad = isMealVoucher;
  const showRightColumn = showCashPad || showVoucherPad;

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

      <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--pg-background))]">
        <header className="shrink-0 border-b border-[hsl(var(--pg-border))] px-4 py-4">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
            <div className="min-w-0">
              <Button variant="ghost" className="mb-2 h-9 px-2 text-sm" onClick={onCancel}>
                ← Torna al conto
              </Button>
              <h1 className="text-2xl font-bold">{title}</h1>
              {tableLabel && (
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{tableLabel}</p>
              )}
            </div>
            <div className="shrink-0 rounded-2xl border-2 border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/5 px-6 py-3 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                Da incassare
              </p>
              <p className="text-3xl font-bold tabular-nums text-[hsl(var(--pg-primary))]">
                {euro(amount)}
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div
            className={`mx-auto grid max-w-6xl gap-6 ${showRightColumn ? "lg:grid-cols-2" : "max-w-3xl"}`}
          >
            <div className="space-y-5">
              {billLines.length > 0 && (
                <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Riepilogo conto
                  </h2>
                  <ul className="space-y-2 text-sm">
                    {billLines.map((line, i) => (
                      <li key={`${line.name}-${i}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {line.quantity}× {line.name}
                        </span>
                        <span className="shrink-0 tabular-nums">{euro(line.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  Metodo di pagamento
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              </section>

              {!isMealVoucher && (
                <section>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Documento fiscale
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {DOC_TYPES.map((d) => (
                      <Button
                        key={d.id}
                        type="button"
                        variant={documentType === d.id ? "default" : "outline"}
                        className="h-11 text-xs sm:text-sm"
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
                </section>
              )}

              {documentType === "INVOICE" && !isMealVoucher && (
                <section>
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
                </section>
              )}

              {documentType === "RECEIPT" && fullMealAvailable && !isMealVoucher && (
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-4 py-3">
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

              {isMixed && (
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Pagamento misto: buono {euro(voucherValue)} +{" "}
                  {remainderMethod === "CASH" ? "contanti" : "POS"} {euro(remainder)}
                </p>
              )}
            </div>

            {showRightColumn && (
              <div className="space-y-4">
                {showVoucherPad && (
                  <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
                    <p className="mb-3 text-sm font-medium">Importo buono pasto</p>
                    <div className="mb-3 flex flex-wrap gap-2">
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
                      <div className="mt-4 space-y-3 border-t border-[hsl(var(--pg-border))] pt-4">
                        <p className="text-center text-sm font-semibold text-[hsl(var(--pg-primary))]">
                          Saldo residuo: {euro(remainder)}
                        </p>
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
                      </div>
                    )}
                  </section>
                )}

                {showCashPad && (
                  <section className="rounded-xl border border-[hsl(var(--pg-border))] p-4">
                    <PaymentPad amount={cashAmount} onChange={onCashAmount} total={amount} />
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 text-sm text-amber-700">
              {!canConfirm && confirmHint}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="h-12 flex-1 px-8 sm:flex-none" onClick={onCancel}>
                Annulla
              </Button>
              <Button
                className="h-12 flex-1 px-10 text-base sm:min-w-[12rem] sm:flex-none"
                disabled={loading || !canConfirm}
                onClick={onConfirm}
              >
                {loading ? "Elaborazione..." : `Incassa ${euro(amount)}`}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
