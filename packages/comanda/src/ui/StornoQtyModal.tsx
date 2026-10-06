import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

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
    <BottomSheet maxHeightClass="max-h-[80dvh]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
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
              className={`min-h-11 min-w-11 rounded-xl border px-2 text-sm font-semibold ${
                qty === n
                  ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/15 text-[hsl(var(--pg-primary))]"
                  : "border-[hsl(var(--pg-border))]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className={bottomSheetFooterClass}>
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
    </BottomSheet>
  );
}
