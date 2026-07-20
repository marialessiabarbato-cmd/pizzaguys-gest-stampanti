import { Button } from "@pizzaguys/ui";
import { useState } from "react";

export function PriceOverrideModal({
  itemName,
  currentPrice,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  currentPrice: number;
  onConfirm: (unitPrice: number) => void;
  onCancel: () => void;
}) {
  const [raw, setRaw] = useState(
    currentPrice.toFixed(2).replace(".", ","),
  );
  const [error, setError] = useState("");

  const submit = () => {
    const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
    const n = Number.parseFloat(normalized);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Inserisci un prezzo valido (> 0)");
      return;
    }
    onConfirm(Math.round(n * 100) / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Prezzo unitario</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{itemName}</p>
        <label className="block text-sm">
          Nuovo prezzo (€)
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            className="mt-1 min-h-14 w-full rounded-xl border border-[hsl(var(--pg-border))] px-4 text-xl font-semibold tabular-nums"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="button" className="min-h-12 flex-1" onClick={submit}>
            Salva
          </Button>
        </div>
      </div>
    </div>
  );
}
