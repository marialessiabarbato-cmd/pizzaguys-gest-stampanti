import { CASH_DENOMINATIONS, sumCashBreakdown, type CashBreakdown } from "@pizzaguys/types";
import { euro, parseEuro } from "../lib/money";

export interface CashCountValue {
  mode: "total" | "breakdown";
  total: string;
  breakdown: CashBreakdown;
}

export const emptyCashCount = (total = ""): CashCountValue => ({
  mode: "total",
  total,
  breakdown: {},
});

/** Importo contato: dal totale digitato o dalla somma dei tagli. NaN se non inserito. */
export function cashCountAmount(value: CashCountValue): number {
  return value.mode === "breakdown" ? sumCashBreakdown(value.breakdown) : parseEuro(value.total);
}

export function cashCountBreakdown(value: CashCountValue): CashBreakdown | undefined {
  if (value.mode !== "breakdown") return undefined;
  const entries = Object.entries(value.breakdown).filter(([, qty]) => qty > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function denominationLabel(value: number) {
  return value >= 1 ? `€ ${value}` : `${Math.round(value * 100)} cent`;
}

/** Conteggio contanti: totale diretto oppure per tagli (D4: facoltativo). */
export function DenominationCounter({
  value,
  onChange,
  label,
}: {
  value: CashCountValue;
  onChange: (next: CashCountValue) => void;
  label: string;
}) {
  const breakdownTotal = sumCashBreakdown(value.breakdown);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex rounded-lg border border-[hsl(var(--pg-border))] p-0.5 text-xs">
          {(["total", "breakdown"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`rounded-md px-2.5 py-1.5 ${
                value.mode === mode
                  ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  : ""
              }`}
              onClick={() => onChange({ ...value, mode })}
            >
              {mode === "total" ? "Totale" : "Per tagli"}
            </button>
          ))}
        </div>
      </div>

      {value.mode === "total" ? (
        <input
          inputMode="decimal"
          className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-3 text-lg tabular-nums"
          placeholder="0,00"
          value={value.total}
          onChange={(e) => onChange({ ...value, total: e.target.value })}
        />
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {CASH_DENOMINATIONS.map((denomination) => {
              const key = String(denomination);
              return (
                <label key={key} className="flex flex-col text-xs">
                  <span className="text-[hsl(var(--pg-muted-foreground))]">
                    {denominationLabel(denomination)}
                  </span>
                  <input
                    inputMode="numeric"
                    className="mt-0.5 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-base tabular-nums"
                    placeholder="0"
                    value={value.breakdown[key] ? String(value.breakdown[key]) : ""}
                    onChange={(e) => {
                      const qty = Math.max(0, Number.parseInt(e.target.value, 10) || 0);
                      onChange({ ...value, breakdown: { ...value.breakdown, [key]: qty } });
                    }}
                  />
                </label>
              );
            })}
          </div>
          <p className="text-right text-sm font-semibold tabular-nums">
            Totale contato: {euro(breakdownTotal)}
          </p>
        </div>
      )}
    </div>
  );
}

export function cashCountIsValid(value: CashCountValue) {
  const amount = cashCountAmount(value);
  return Number.isFinite(amount) && amount >= 0;
}

export { parseEuro };
