import { Button } from "@pizzaguys/ui";
import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useState } from "react";
import type { Product, VariantGroup, VariantSelection } from "../lib/types";
import { localized } from "../lib/menu";

interface Props {
  product: Product;
  groups: VariantGroup[];
  basePrice: number;
  onConfirm: (variants: VariantSelection[]) => void;
  onCancel: () => void;
}

export function VariantSheet({ product, groups, basePrice, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<VariantSelection[]>([]);

  const toggle = (group: VariantGroup, variant: VariantGroup["variants"][0]) => {
    const name = localized(variant.name);
    const entry: VariantSelection = {
      variantId: variant.id,
      name,
      type: variant.type,
      priceDelta: Number(variant.priceDelta),
    };
    setSelected((prev) => {
      const sameGroup = prev.filter((v) => {
        const inGroup = group.variants.some((gv) => gv.id === v.variantId);
        return !inGroup;
      });
      const exists = prev.some((v) => v.variantId === variant.id);
      return exists ? sameGroup : [...sameGroup, entry];
    });
  };

  const unitPrice = calculateLinePrice(
    basePrice,
    selected.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="max-h-[70vh] w-full overflow-y-auto rounded-t-2xl bg-[hsl(var(--pg-background))] p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{localized(product.name)}</h2>
          <Button variant="ghost" onClick={onCancel}>✕</Button>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessuna variante disponibile</p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="mb-4">
              <p className="mb-2 text-sm font-semibold">{localized(group.name)}</p>
              <div className="flex flex-wrap gap-2">
                {group.variants.map((v) => {
                  const active = selected.some((s) => s.variantId === v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggle(group, v)}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        active
                          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                          : "border-[hsl(var(--pg-border))]"
                      }`}
                    >
                      {v.type === "REMOVE" ? "NO " : "+"}
                      {localized(v.name)}
                      {Number(v.priceDelta) > 0 && ` (+€${Number(v.priceDelta).toFixed(2)})`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[hsl(var(--pg-border))] pt-4">
          <span className="text-lg font-bold">€ {unitPrice.toFixed(2)}</span>
          <Button onClick={() => onConfirm(selected)}>Aggiungi</Button>
        </div>
      </div>
    </div>
  );
}
