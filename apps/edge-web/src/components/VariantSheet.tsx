import { Button } from "@pizzaguys/ui";
import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useMemo, useState } from "react";
import type { Product, VariantOption, VariantSelection } from "../lib/order-types";
import { localized } from "../lib/order-menu";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

type TypeFilter = "ALL" | "ADD" | "REMOVE";

function formatEuroInput(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function parseEuroInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

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
  const [selected, setSelected] = useState<VariantSelection[]>(() =>
    initialVariants.map((v) => ({
      ...v,
      priceDelta: Number(v.priceDelta) || 0,
    })),
  );
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of initialVariants) {
      if (v.type === "ADD") {
        init[v.variantId] = formatEuroInput(Math.max(0, Number(v.priceDelta) || 0));
      }
    }
    return init;
  });
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const hasAdd = variants.some((v) => v.type === "ADD");
  const hasRemove = variants.some((v) => v.type === "REMOVE");
  const showTypeFilter = hasAdd && hasRemove;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variants.filter((v) => {
      if (typeFilter !== "ALL" && v.type !== typeFilter) return false;
      if (!q) return true;
      return localized(v.name).toLowerCase().includes(q);
    });
  }, [variants, query, typeFilter]);

  const toggle = (variant: VariantOption) => {
    const name = localized(variant.name);
    const catalogPrice = Number(variant.priceDelta) || 0;
    const exists = selected.some((v) => v.variantId === variant.id);
    if (exists) {
      setSelected((prev) => prev.filter((v) => v.variantId !== variant.id));
      return;
    }
    const draft = priceDrafts[variant.id];
    const parsed = draft != null ? parseEuroInput(draft) : null;
    const priceDelta = variant.type === "ADD" ? (parsed ?? catalogPrice) : catalogPrice;
    if (variant.type === "ADD" && draft == null) {
      setPriceDrafts((d) => ({ ...d, [variant.id]: formatEuroInput(catalogPrice) }));
    }
    setSelected((prev) => [
      ...prev,
      {
        variantId: variant.id,
        name,
        type: variant.type,
        priceDelta,
      },
    ]);
  };

  const setAddPrice = (variantId: string, raw: string) => {
    setPriceDrafts((prev) => ({ ...prev, [variantId]: raw }));
    const parsed = parseEuroInput(raw);
    if (parsed == null) return;
    setSelected((prev) =>
      prev.map((v) =>
        v.variantId === variantId && v.type === "ADD" ? { ...v, priceDelta: parsed } : v,
      ),
    );
  };

  const unitPrice = useMemo(
    () =>
      calculateLinePrice(
        basePrice,
        selected.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
      ),
    [basePrice, selected],
  );

  const canConfirm =
    unitPrice > 0 &&
    selected.every((v) => {
      if (v.type !== "ADD") return true;
      const raw = priceDrafts[v.variantId];
      if (raw == null) return v.priceDelta >= 0;
      return parseEuroInput(raw) != null;
    });

  return (
    <OffCanvas widthClass="max-w-md" onClose={onCancel}>
      <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--pg-border))] px-5 py-4">
        <h2 className="text-lg font-bold">{localized(product.name)}</h2>
        <Button variant="ghost" className="min-h-11 min-w-11" onClick={onCancel}>
          ✕
        </Button>
      </div>

      {variants.length > 0 && (
        <div className="shrink-0 space-y-2 border-b border-[hsl(var(--pg-border))] px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca ingrediente…"
            autoFocus={false}
            className="min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] bg-transparent px-3 text-base"
          />
          {showTypeFilter && (
            <div className="flex gap-2">
              {(
                [
                  { id: "ALL", label: "Tutti" },
                  { id: "REMOVE", label: "Rimuovi" },
                  { id: "ADD", label: "Aggiungi" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold ${
                    typeFilter === opt.id
                      ? "bg-[hsl(var(--pg-primary))] text-white"
                      : "bg-[hsl(var(--pg-muted))]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {variants.length === 0 ? (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessuna variante disponibile
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun risultato
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filtered.map((v) => {
              const active = selected.some((s) => s.variantId === v.id);
              const catalogPrice = Number(v.priceDelta) || 0;
              const selectedEntry = selected.find((s) => s.variantId === v.id);
              return (
                <div
                  key={v.id}
                  className={`rounded-xl border px-3 py-2 ${
                    active
                      ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                      : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(v)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="font-medium">
                      {v.type === "REMOVE" ? "NO " : "+"}
                      {localized(v.name)}
                    </span>
                    {v.type === "ADD" && !active && catalogPrice > 0 && (
                      <span className="text-[hsl(var(--pg-muted-foreground))]">
                        +€ {catalogPrice.toFixed(2)}
                      </span>
                    )}
                    {v.type === "ADD" && active && (
                      <span className="text-xs font-medium text-[hsl(var(--pg-primary))]">
                        Selezionata
                      </span>
                    )}
                    {v.type === "REMOVE" && active && (
                      <span className="text-xs font-medium text-[hsl(var(--pg-primary))]">
                        Selezionata
                      </span>
                    )}
                  </button>
                  {v.type === "ADD" && active && (
                    <label className="mt-2 flex items-center justify-between gap-2 border-t border-[hsl(var(--pg-border))]/60 pt-2 text-sm">
                      <span className="text-[hsl(var(--pg-muted-foreground))]">
                        Prezzo aggiunta
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[hsl(var(--pg-muted-foreground))]">€</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="min-h-11 w-24 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-2 text-right text-base font-semibold tabular-nums"
                          value={
                            priceDrafts[v.id] ??
                            formatEuroInput(selectedEntry?.priceDelta ?? catalogPrice)
                          }
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setAddPrice(v.id, e.target.value)}
                        />
                      </div>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${offCanvasFooterClass} items-center justify-between`}>
        <div>
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">Totale riga</p>
          <span className="text-lg font-bold tabular-nums">€ {unitPrice.toFixed(2)}</span>
        </div>
        <Button
          className="min-h-12 px-6"
          disabled={!canConfirm}
          onClick={() => onConfirm(selected)}
        >
          {confirmLabel}
        </Button>
      </div>
    </OffCanvas>
  );
}
