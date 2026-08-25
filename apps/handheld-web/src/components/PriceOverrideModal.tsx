import { Button } from "@pizzaguys/ui";
import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useMemo, useState } from "react";
import type { VariantSelection } from "../lib/types";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

function formatEuroInput(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function parseEuroInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export type PriceOverrideResult = {
  unitPrice: number;
  basePrice: number;
  variants: VariantSelection[];
};

export function PriceOverrideModal({
  itemName,
  currentPrice,
  basePrice,
  variants = [],
  onConfirm,
  onCancel,
}: {
  itemName: string;
  currentPrice: number;
  basePrice?: number;
  variants?: VariantSelection[];
  onConfirm: (result: PriceOverrideResult) => void;
  onCancel: () => void;
}) {
  const addVariants = variants.filter((v) => v.type === "ADD");
  const variantSum = variants.reduce((s, v) => s + (Number(v.priceDelta) || 0), 0);
  const resolvedBase =
    basePrice != null && basePrice > 0
      ? basePrice
      : Math.round((currentPrice - variantSum) * 100) / 100;
  const canEditAdds = addVariants.length > 0 && resolvedBase > 0;

  const [baseRaw, setBaseRaw] = useState(formatEuroInput(resolvedBase > 0 ? resolvedBase : currentPrice));
  const [addPrices, setAddPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of addVariants) {
      init[v.variantId] = formatEuroInput(Math.max(0, Number(v.priceDelta) || 0));
    }
    return init;
  });
  const [totalRaw, setTotalRaw] = useState(formatEuroInput(currentPrice));
  const [error, setError] = useState("");

  const live = useMemo(() => {
    if (!canEditAdds) return null;
    const base = parseEuroInput(baseRaw);
    if (base == null || !(base > 0)) return { ok: false as const, error: "Prezzo base non valido" };
    const nextAdds: VariantSelection[] = [];
    for (const v of variants) {
      if (v.type !== "ADD") continue;
      const delta = parseEuroInput(addPrices[v.variantId] ?? "0");
      if (delta == null) {
        return { ok: false as const, error: `Prezzo non valido per ${v.name}` };
      }
      nextAdds.push({ ...v, priceDelta: delta });
    }
    const nextVariants = [...variants.filter((v) => v.type !== "ADD"), ...nextAdds];
    const unitPrice = calculateLinePrice(
      base,
      nextVariants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
    );
    if (!(unitPrice > 0)) {
      return { ok: false as const, error: "Il totale riga deve essere > 0" };
    }
    return { ok: true as const, basePrice: base, variants: nextVariants, unitPrice };
  }, [canEditAdds, baseRaw, addPrices, variants]);

  const submit = () => {
    if (canEditAdds) {
      if (!live?.ok) {
        setError(live?.error ?? "Dati non validi");
        return;
      }
      onConfirm({
        unitPrice: live.unitPrice,
        basePrice: live.basePrice,
        variants: live.variants,
      });
      return;
    }

    const n = parseEuroInput(totalRaw);
    if (n == null || n <= 0) {
      setError("Inserisci un prezzo valido (> 0)");
      return;
    }
    onConfirm({
      unitPrice: n,
      basePrice: basePrice != null && basePrice > 0 ? basePrice : n,
      variants,
    });
  };

  return (
    <BottomSheet maxHeightClass="max-h-[90dvh]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
        <h2 className="mb-1 text-lg font-semibold">
          {canEditAdds ? "Prezzo aggiunte" : "Prezzo unitario"}
        </h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{itemName}</p>

        {canEditAdds ? (
          <div className="space-y-3">
            <label className="block text-sm">
              Prezzo base piatto (€)
              <input
                type="text"
                inputMode="decimal"
                className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-4 text-lg font-semibold tabular-nums"
                value={baseRaw}
                onChange={(e) => {
                  setBaseRaw(e.target.value);
                  setError("");
                }}
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium">Aggiunte</p>
              <div className="space-y-2">
                {addVariants.map((v) => (
                  <label
                    key={v.variantId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">+ {v.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">€</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="min-h-11 w-24 rounded-lg border border-[hsl(var(--pg-border))] px-2 text-right text-base font-semibold tabular-nums"
                        value={addPrices[v.variantId] ?? "0,00"}
                        onChange={(e) => {
                          setAddPrices((prev) => ({ ...prev, [v.variantId]: e.target.value }));
                          setError("");
                        }}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-[hsl(var(--pg-muted))]/40 px-4 py-3">
              <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">Totale riga (auto)</p>
              <p className="text-xl font-bold tabular-nums">
                € {(live?.ok ? live.unitPrice : currentPrice).toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <label className="block text-sm">
            Nuovo prezzo (€)
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 min-h-14 w-full rounded-xl border border-[hsl(var(--pg-border))] px-4 text-xl font-semibold tabular-nums"
              value={totalRaw}
              onChange={(e) => {
                setTotalRaw(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className={bottomSheetFooterClass}>
        <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="button" className="min-h-12 flex-1" onClick={submit}>
          Salva
        </Button>
      </div>
    </BottomSheet>
  );
}
