import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";
import { PinModal } from "./PinModal";

type Mode = "percent" | "amount" | "cover";

export type TableDiscountRequest =
  | { kind: "percent"; percent: number; managerPin?: string }
  | { kind: "amount"; amount: number; managerPin: string }
  | { kind: "cover"; waived: boolean; managerPin: string };

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Sconto libero sul conto (F12): % con decimali su tutte le righe, importo in € (riga
 * "Sconto"), togli/rimetti coperti. € e coperti chiedono sempre il PIN responsabile, la %
 * solo oltre la soglia della sede.
 */
export function TableDiscountModal({
  total,
  maxPercent,
  pinThreshold,
  coverWaived,
  coverTotal,
  currentAmount,
  error,
  onApply,
  onCancel,
}: {
  total: number;
  maxPercent: number;
  pinThreshold: number;
  coverWaived: boolean;
  /** Importo coperti oggi nel conto (0 se tolti o assenti) */
  coverTotal: number;
  currentAmount?: number;
  error?: string;
  onApply: (req: TableDiscountRequest) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>("percent");
  const [value, setValue] = useState("");
  const [pinFor, setPinFor] = useState<TableDiscountRequest | null>(null);

  const num = Number(value.replace(",", "."));
  const valid =
    mode === "cover" ||
    (Number.isFinite(num) &&
      num > 0 &&
      (mode === "percent" ? num <= maxPercent : num <= total + (currentAmount ?? 0)));

  const submit = () => {
    if (!valid) return;
    if (mode === "percent") {
      const req: TableDiscountRequest = { kind: "percent", percent: Math.round(num * 100) / 100 };
      if (num > pinThreshold) setPinFor(req);
      else onApply(req);
      return;
    }
    if (mode === "amount") {
      setPinFor({ kind: "amount", amount: Math.round(num * 100) / 100, managerPin: "" });
      return;
    }
    setPinFor({ kind: "cover", waived: !coverWaived, managerPin: "" });
  };

  if (pinFor) {
    const title =
      pinFor.kind === "percent"
        ? `PIN manager — sconto ${String(pinFor.percent).replace(".", ",")}% sul conto`
        : pinFor.kind === "amount"
          ? `PIN manager — sconto ${euro(pinFor.amount)}`
          : pinFor.waived
            ? "PIN manager — togli coperti"
            : "PIN manager — rimetti coperti";
    return (
      <PinModal
        title={title}
        error={error}
        onComplete={(pin) => onApply({ ...pinFor, managerPin: pin } as TableDiscountRequest)}
        onCancel={() => setPinFor(null)}
      />
    );
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "percent", label: "%" },
    { id: "amount", label: "€" },
    { id: "cover", label: "Coperti" },
  ];

  return (
    <OffCanvas widthClass="max-w-md" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-1 text-lg font-bold">Sconto sul conto</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">Totale attuale {euro(total)}</p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant={mode === t.id ? "default" : "outline"}
              className="min-h-11"
              onClick={() => {
                setMode(t.id);
                setValue("");
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {mode === "cover" ? (
          <p className="text-sm">
            {coverWaived
              ? "I coperti sono stati tolti da questo conto. Puoi rimetterli."
              : coverTotal > 0
                ? `Togli i coperti dal conto (${euro(coverTotal)}).`
                : "Nessun coperto nel conto."}
            <span className="mt-1 block text-xs text-orange-600">Richiesto PIN manager</span>
          </p>
        ) : (
          <label className="block text-sm">
            {mode === "percent"
              ? `Percentuale su tutte le righe (max ${maxPercent}%, es. 0,75)`
              : "Importo da scontare in euro"}
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ""))}
              className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2 text-lg"
            />
            {mode === "amount" && (
              <span className="mt-1 block text-xs text-orange-600">
                Riga «Sconto» in fondo al conto · richiesto PIN manager
                {currentAmount ? ` · sostituisce lo sconto attuale di ${euro(currentAmount)}` : ""}
              </span>
            )}
            {mode === "percent" && num > pinThreshold && (
              <span className="mt-1 block text-xs text-orange-600">Oltre {pinThreshold}% — richiesto PIN manager</span>
            )}
          </label>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button
          className="min-h-12 flex-1"
          disabled={!valid || (mode === "cover" && !coverWaived && coverTotal <= 0)}
          onClick={submit}
        >
          {mode === "cover" ? (coverWaived ? "Rimetti coperti" : "Togli coperti") : "Applica"}
        </Button>
      </div>
    </OffCanvas>
  );
}
