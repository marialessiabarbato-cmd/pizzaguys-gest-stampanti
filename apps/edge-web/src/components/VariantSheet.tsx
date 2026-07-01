import { Button } from "@pizzaguys/ui";
import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useState } from "react";
import type { Product, VariantOption, VariantSelection } from "../lib/order-types";
import { localized } from "../lib/order-menu";

interface Props {
  product: Product;
  variants: VariantOption[];
  basePrice: number;
  initialVariants?: VariantSelection[];
  confirmLabel?: string;
  onConfirm: (variants: VariantSelection[]) => void;
  onCancel: () => void;
}

export function VariantSheet({
  product,
  variants,
  basePrice,
  initialVariants = [],
  confirmLabel = "Aggiungi",
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState<VariantSelection[]>(initialVariants);

  const toggle = (variant: VariantOption) => {
    const name = localized(variant.name);
    const entry: VariantSelection = {
      variantId: variant.id,
      name,
      type: variant.type,
      priceDelta: Number(variant.priceDelta),
    };
    setSelected((prev) => {
      const exists = prev.some((v) => v.variantId === variant.id);
      return exists ? prev.filter((v) => v.variantId !== variant.id) : [...prev, entry];
    });
  };

  const unitPrice = calculateLinePrice(
    basePrice,
    selected.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="flex max-h-[75vh] w-full flex-col rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl">
        <div className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-lg font-bold">{localized(product.name)}</h2>
          <Button variant="ghost" onClick={onCancel}>✕</Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {variants.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessuna variante disponibile</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {variants.map((v) => {
                const active = selected.some((s) => s.variantId === v.id);
                const price = Number(v.priceDelta);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggle(v)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${
                      active
                        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                        : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]"
                    }`}
                  >
                    <span className="font-medium">
                      {v.type === "REMOVE" ? "NO " : "+"}
                      {localized(v.name)}
                    </span>
                    {price > 0 && (
                      <span className={active ? "opacity-90" : "text-[hsl(var(--pg-muted-foreground))]"}>
                        +€ {price.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[hsl(var(--pg-border))] px-4 py-3">
          <span className="text-lg font-bold">€ {unitPrice.toFixed(2)}</span>
          <Button onClick={() => onConfirm(selected)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
