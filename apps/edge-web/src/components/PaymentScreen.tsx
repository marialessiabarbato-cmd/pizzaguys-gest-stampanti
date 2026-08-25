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
  error,
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
  /** Errore API/pagamento da mostrare in schermata (non solo sul conto). */
  error?: string;
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
        <header className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--pg-border))] px-3 py-2">
          <Button variant="ghost" className="min-h-10 shrink-0 px-2 text-sm" onClick={onCancel}>
            ← Conto
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
            {tableLabel && (
              <p className="truncate text-xs text-[hsl(var(--pg-muted-foreground))]">{tableLabel}</p>
            )}
          </div>
          <div className="shrink-0 rounded-xl border-2 border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/5 px-4 py-1.5 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
              Da incassare
            </p>
            <p className="text-2xl font-bold tabular-nums leading-none text-[hsl(var(--pg-primary))]">
              {euro(amount)}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div
            className={`mx-auto grid min-h-0 max-w-6xl gap-3 ${
              showRightColumn
                ? "lg:h-full lg:grid-cols-2 lg:overflow-hidden"
                : "max-w-3xl"
            }`}
          >
            <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
              {billLines.length > 0 && (
                <section className="shrink-0 rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2">
                  <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Riepilogo conto
                  </h2>
                  <ul className="max-h-28 space-y-1 overflow-y-auto text-sm">
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

              <section className="shrink-0">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  Metodo di pagamento
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {METHODS.map((m) => (
                    <Button
                      key={m.id}
                      type="button"
                      variant={method === m.id ? "default" : "outline"}
                      className="min-h-11 px-1 text-xs sm:text-sm"
                      onClick={() => onMethod(m.id)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </section>

              {!isMealVoucher && (
                <section className="shrink-0">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                    Documento fiscale
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DOC_TYPES.map((d) => (
                      <Button
                        key={d.id}
                        type="button"
                        variant={documentType === d.id ? "default" : "outline"}
                        className="min-h-11 text-xs sm:text-sm"
                        onClick={() => {
                          onDocumentType(d.id);
                          if (d.id !== "INVOICE") {
                            onInvoiceCustomer(EMPTY_INVOICE_CUSTOMER);
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
                <section className="min-h-0 shrink overflow-y-auto">
                  <InvoiceCustomerForm
                    value={invoiceCustomer}
                    onChange={onInvoiceCustomer}
                    disabled={loading}
                    headerAction={
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10 shrink-0 px-3 text-xs sm:text-sm"
                        disabled={loading}
                        onClick={() => setShowCustomerPicker(true)}
                      >
                        Rubrica
                      </Button>
                    }
                  >
                    {fullMealAvailable && (
                      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 border-t border-[hsl(var(--pg-border))] pt-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          checked={fullMealReceipt}
                          disabled={loading}
                          onChange={(e) => onFullMealReceipt(e.target.checked)}
                        />
                        <span className="text-sm leading-snug">
                          <span className="font-medium">Fattura come &quot;Pasto completo&quot;</span>
                          <span className="mt-0.5 block text-xs text-[hsl(var(--pg-muted-foreground))]">
                            Una sola riga fiscale al totale.
                          </span>
                        </span>
                      </label>
                    )}
                  </InvoiceCustomerForm>
                </section>
              )}

              {isMixed && (
                <p className="shrink-0 text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Pagamento misto: buono {euro(voucherValue)} +{" "}
                  {remainderMethod === "CASH" ? "contanti" : "POS"} {euro(remainder)}
                </p>
              )}
            </div>

            {showRightColumn && (
              <div className="flex min-h-0 flex-col lg:overflow-y-auto">
                {showVoucherPad && (
                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[hsl(var(--pg-border))] p-3">
                    <p className="mb-2 shrink-0 text-sm font-medium">Importo buono pasto</p>
                    <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
                      {presets.map((p) => (
                        <Button
                          key={p.id}
                          type="button"
                          variant="outline"
                          className="min-h-10 min-w-[4rem] text-sm"
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
                      <div className="mt-3 shrink-0 space-y-2 border-t border-[hsl(var(--pg-border))] pt-3">
                        <p className="text-center text-sm font-semibold text-[hsl(var(--pg-primary))]">
                          Saldo residuo: {euro(remainder)}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            type="button"
                            variant={remainderMethod === "CASH" ? "default" : "outline"}
                            className="min-h-10"
                            onClick={() => onRemainderMethod("CASH")}
                          >
                            Contanti
                          </Button>
                          <Button
                            type="button"
                            variant={remainderMethod === "POS" ? "default" : "outline"}
                            className="min-h-10"
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
                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[hsl(var(--pg-border))] p-3">
                    <PaymentPad amount={cashAmount} onChange={onCashAmount} total={amount} />
                  </section>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 py-2.5">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 space-y-0.5 text-sm">
              {error ? (
                <p className="rounded-md bg-red-100 px-2 py-1 font-medium text-red-800">{error}</p>
              ) : null}
              {!canConfirm && confirmHint ? (
                <p
                  className={`rounded-md px-2 py-1 font-medium ${
                    documentType === "INVOICE" && !invoiceOk
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {confirmHint}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-12 flex-1 px-6 sm:flex-none" onClick={onCancel}>
                Annulla
              </Button>
              <Button
                className="min-h-12 flex-1 px-8 text-base sm:min-w-[11rem] sm:flex-none"
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
