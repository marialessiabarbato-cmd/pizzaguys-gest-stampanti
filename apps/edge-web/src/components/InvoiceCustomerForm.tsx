import type { InvoiceCustomer } from "@pizzaguys/types";
import { useMemo, useState, type ReactNode } from "react";

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

type FieldKey = keyof InvoiceCustomer;
type FieldErrors = Partial<Record<FieldKey, string>>;

function invoiceFieldErrors(value: InvoiceCustomer): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.businessName.trim()) {
    errors.businessName = "Ragione sociale obbligatoria";
  }

  const vat = value.vatNumber?.trim() ?? "";
  const tax = value.taxCode?.trim() ?? "";
  if (!vat && !tax) {
    errors.vatNumber = "Inserisci P.IVA o codice fiscale";
    errors.taxCode = "Inserisci P.IVA o codice fiscale";
  } else {
    if (vat && !VAT_RE.test(vat)) errors.vatNumber = "P.IVA non valida — 11 cifre";
    if (tax && !TAX_CODE_RE.test(tax)) errors.taxCode = "Codice fiscale non valido";
  }

  const sdi = value.sdiCode?.trim() ?? "";
  const pec = value.pec?.trim() ?? "";
  if (!sdi && !pec) {
    errors.sdiCode = "Inserisci codice SDI o PEC";
    errors.pec = "Inserisci codice SDI o PEC";
  } else {
    if (sdi && !SDI_RE.test(sdi)) errors.sdiCode = "SDI non valido — 7 caratteri";
    if (pec && !PEC_RE.test(pec)) errors.pec = "Indirizzo PEC non valido";
  }

  return errors;
}

export function InvoiceCustomerForm({
  value,
  onChange,
  disabled,
  headerAction,
  children,
}: {
  value: InvoiceCustomer;
  onChange: (next: InvoiceCustomer) => void;
  disabled?: boolean;
  headerAction?: ReactNode;
  children?: ReactNode;
}) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const errors = useMemo(() => invoiceFieldErrors(value), [value]);
  const anyTouched = Object.values(touched).some(Boolean);
  const hasFormatError = (Object.keys(errors) as FieldKey[]).some(
    (key) => (value[key] ?? "").trim().length > 0 && !!errors[key],
  );

  const showFieldError = (key: FieldKey): boolean => {
    if (!errors[key]) return false;
    const raw = (value[key] ?? "").trim();
    if (raw) return true;
    return anyTouched || hasFormatError;
  };

  const setField = (key: FieldKey, next: string) => {
    onChange({ ...value, [key]: next });
  };

  const markTouched = (key: FieldKey) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Fattura elettronica
          </p>
          <p className="text-sm font-semibold leading-tight">Dati cliente</p>
        </div>
        {headerAction}
      </div>

      <div className="space-y-3">
        <Field
          label="Ragione sociale / Nome"
          required
          value={value.businessName}
          error={errors.businessName}
          showError={showFieldError("businessName")}
          disabled={disabled}
          placeholder="Es. Rossi S.r.l."
          onChange={(v) => setField("businessName", v)}
          onBlur={() => markTouched("businessName")}
        />

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Identificativo fiscale
            <span className="ml-1 font-normal normal-case tracking-normal">— P.IVA o CF</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Partita IVA"
              value={value.vatNumber ?? ""}
              error={errors.vatNumber}
              showError={showFieldError("vatNumber")}
              disabled={disabled}
              placeholder="11 cifre"
              inputMode="numeric"
              onChange={(v) => setField("vatNumber", v)}
              onBlur={() => markTouched("vatNumber")}
            />
            <Field
              label="Codice fiscale"
              value={value.taxCode ?? ""}
              error={errors.taxCode}
              showError={showFieldError("taxCode")}
              disabled={disabled}
              placeholder="16 caratteri"
              onChange={(v) => setField("taxCode", v)}
              onBlur={() => markTouched("taxCode")}
            />
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Destinatario SDI
            <span className="ml-1 font-normal normal-case tracking-normal">— codice o PEC</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Codice SDI"
              value={value.sdiCode ?? ""}
              error={errors.sdiCode}
              showError={showFieldError("sdiCode")}
              disabled={disabled}
              placeholder="7 caratteri"
              onChange={(v) => setField("sdiCode", v)}
              onBlur={() => markTouched("sdiCode")}
            />
            <Field
              label="PEC"
              value={value.pec ?? ""}
              error={errors.pec}
              showError={showFieldError("pec")}
              disabled={disabled}
              placeholder="cliente@pec.it"
              inputMode="email"
              onChange={(v) => setField("pec", v)}
              onBlur={() => markTouched("pec")}
            />
          </div>
        </fieldset>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  required,
  value,
  error,
  showError,
  disabled,
  placeholder,
  inputMode,
  onChange,
  onBlur,
}: {
  label: string;
  required?: boolean;
  value: string;
  error?: string;
  showError: boolean;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "email" | "text";
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const isInvalid = showError && !!error;
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-[hsl(var(--pg-muted-foreground))]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        aria-invalid={isInvalid}
        className={`h-11 w-full rounded-lg border bg-[hsl(var(--pg-background))] px-3 text-sm outline-none transition placeholder:text-[hsl(var(--pg-muted-foreground))]/60 ${
          isInvalid
            ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            : "border-[hsl(var(--pg-border))] focus:border-[hsl(var(--pg-primary))] focus:ring-2 focus:ring-[hsl(var(--pg-primary))]/25"
        }`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {isInvalid ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
    </label>
  );
}

export function isInvoiceCustomerValid(value: InvoiceCustomer): boolean {
  return Object.keys(invoiceFieldErrors(value)).length === 0;
}
