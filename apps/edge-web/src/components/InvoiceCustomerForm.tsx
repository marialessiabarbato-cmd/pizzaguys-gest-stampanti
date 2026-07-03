import type { InvoiceCustomer } from "@pizzaguys/types";
import { useMemo, useState } from "react";

export const EMPTY_INVOICE_CUSTOMER: InvoiceCustomer = {
  businessName: "",
  vatNumber: "",
  taxCode: "",
  sdiCode: "",
  pec: "",
};

const VAT_RE = /^[0-9]{11}$/;
const TAX_CODE_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i;
const SDI_RE = /^[A-Z0-9]{7}$/i;
const PEC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInvoiceCustomer(value: InvoiceCustomer): string[] {
  const errors: string[] = [];
  if (!value.businessName.trim()) errors.push("Ragione sociale obbligatoria");
  if (!value.vatNumber?.trim() && !value.taxCode?.trim()) {
    errors.push("Inserire Partita IVA o Codice Fiscale");
  }
  if (value.vatNumber?.trim() && !VAT_RE.test(value.vatNumber.trim())) {
    errors.push("Partita IVA non valida (11 cifre)");
  }
  if (value.taxCode?.trim() && !TAX_CODE_RE.test(value.taxCode.trim())) {
    errors.push("Codice fiscale non valido");
  }
  if (!value.sdiCode?.trim() && !value.pec?.trim()) {
    errors.push("Inserire Codice SDI o indirizzo PEC");
  }
  if (value.sdiCode?.trim() && !SDI_RE.test(value.sdiCode.trim())) {
    errors.push("Codice SDI non valido (7 caratteri)");
  }
  if (value.pec?.trim() && !PEC_RE.test(value.pec.trim())) {
    errors.push("PEC non valida");
  }
  return errors;
}

export function InvoiceCustomerForm({
  value,
  onChange,
  disabled,
}: {
  value: InvoiceCustomer;
  onChange: (next: InvoiceCustomer) => void;
  disabled?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateInvoiceCustomer(value), [value]);

  const field = (key: keyof InvoiceCustomer, label: string, placeholder: string) => (
    <label className="block text-sm">
      <span className="mb-1 block text-[hsl(var(--pg-muted-foreground))]">{label}</span>
      <input
        className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
        placeholder={placeholder}
        value={value[key] ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        onBlur={() => setTouched(true)}
      />
    </label>
  );

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        Dati cliente per fattura elettronica
      </p>
      {field("businessName", "Ragione sociale / Nome *", "Es. Rossi S.r.l.")}
      <div className="grid grid-cols-2 gap-2">
        {field("vatNumber", "Partita IVA", "11 cifre")}
        {field("taxCode", "Codice fiscale", "16 caratteri")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("sdiCode", "Codice SDI", "7 caratteri")}
        {field("pec", "PEC", "cliente@pec.it")}
      </div>
      <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
        Obbligatori: ragione sociale + (P.IVA o CF) + (SDI o PEC). Emissione mock — XML in{" "}
        <code className="text-[11px]">tmp/prints/</code>.
      </p>
      {touched && errors.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600">
          {errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function isInvoiceCustomerValid(value: InvoiceCustomer): boolean {
  return validateInvoiceCustomer(value).length === 0;
}
