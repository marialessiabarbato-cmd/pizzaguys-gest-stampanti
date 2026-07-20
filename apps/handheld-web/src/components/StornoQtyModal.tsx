import { Button } from "@pizzaguys/ui";
import { useState } from "react";

export function StornoQtyModal({
  itemName,
  maxQty,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  maxQty: number;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Quantità da stornare</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
          {itemName} — rimanenti {maxQty}
        </p>
        <div className="mb-4 flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="outline"
            className="h-14 w-14 text-2xl"
            disabled={qty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            −
          </Button>
          <span className="min-w-[3rem] text-center text-4xl font-bold tabular-nums">{qty}</span>
          <Button
            type="button"
            variant="outline"
            className="h-14 w-14 text-2xl"
            disabled={qty >= maxQty}
            onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
          >
            +
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty(n)}
              className={`min-h-10 min-w-10 rounded-lg border px-2 text-sm font-semibold ${
                qty === n
                  ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15 text-[hsl(var(--pg-primary))]"
                  : "border-[hsl(var(--pg-border))]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1"
            variant="danger"
            onClick={() => onConfirm(qty)}
          >
            Storna {qty}
          </Button>
        </div>
      </div>
    </div>
  );
}
