import { useEffect, useRef } from "react";
import { EU_ALLERGENS } from "../allergens";
import { fuzzyMatch, localized, resolvePrice } from "../menu";
import type { Category, LastAddedLine, MenuSnapshot, Product } from "../types";

export function MenuPanel({
  menu,
  categories,
  selectedCat,
  search,
  allergenFilter,
  channel,
  autofocusSearch = false,
  onSelectCat,
  onSearchChange,
  onAllergenToggle,
  onAddProduct,
  cartQtyByProduct = {},
  lastAdded = null,
  variant = "list",
}: {
  menu: MenuSnapshot;
  categories: Category[];
  selectedCat: string | null;
  search: string;
  allergenFilter: string[];
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  autofocusSearch?: boolean;
  onSelectCat: (id: string) => void;
  onSearchChange: (v: string) => void;
  onAllergenToggle: (id: string) => void;
  onAddProduct: (p: Product) => void;
  /** Pezzi già in bozza per prodotto (tutte le varianti e portate). */
  cartQtyByProduct?: Record<string, number>;
  lastAdded?: LastAddedLine | null;
  /** "list" righe (palmare), "grid" tessere (cassa, schermo largo). */
  variant?: "list" | "grid";
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autofocusSearch) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [autofocusSearch]);

  // Con una ricerca attiva si cerca in tutto il menu, ignorando la categoria.
  const searching = search.trim().length > 0;
  const products = menu.products.filter((p) => {
    if (searching) return fuzzyMatch(localized(p.name), search);
    return !selectedCat || p.categoryId === selectedCat;
  });

  const isExcluded = (p: Product) =>
    allergenFilter.length > 0 &&
    allergenFilter.some((a) => (p.allergenIds ?? []).includes(a));

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]/95 p-3 backdrop-blur-sm">
        <input
          ref={searchRef}
          type="search"
          placeholder="Cerca piatto..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-14 w-full rounded-xl border-2 border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-4 text-base font-medium shadow-sm outline-none focus:border-[hsl(var(--pg-primary))]"
          aria-label="Cerca piatto"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const active = !searching && selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectCat(c.id);
                  if (searching) onSearchChange("");
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                  active ? "text-white" : "bg-[hsl(var(--pg-muted))]"
                }`}
                style={active ? { backgroundColor: c.colorHex } : undefined}
              >
                {localized(c.name)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EU_ALLERGENS.slice(0, 6).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAllergenToggle(a.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs ${
                allergenFilter.includes(a.id) ? "bg-red-500 text-white" : "bg-[hsl(var(--pg-muted))]"
              }`}
            >
              −{a.label}
            </button>
          ))}
        </div>
      </div>

      {products.length === 0 && (
        <p className="py-10 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
          Nessun piatto trovato
        </p>
      )}
      {variant === "grid" ? (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map((p) => {
            const excluded = isExcluded(p);
            const price = resolvePrice(p, channel, menu.prices ?? []);
            const inCart = cartQtyByProduct[p.id] ?? 0;
            const justAdded = lastAdded?.productId === p.id;
            return (
              <button
                // Chiave nuova a ogni aggiunta per far ripartire l'animazione.
                key={justAdded ? `${p.id}-${lastAdded.seq}` : p.id}
                type="button"
                disabled={excluded}
                onClick={() => onAddProduct(p)}
                className={`relative flex min-h-[72px] flex-col justify-center rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                  inCart > 0 ? "border-[hsl(var(--pg-primary))]/50" : "border-[hsl(var(--pg-border))]"
                } ${excluded ? "pointer-events-none opacity-30" : ""} ${justAdded ? "pg-added-flash" : ""}`}
              >
                {inCart > 0 && (
                  <span
                    key={justAdded ? lastAdded.seq : "qty"}
                    className={`absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1.5 text-xs font-bold tabular-nums text-[hsl(var(--pg-primary-foreground))] ${
                      justAdded ? "pg-pop" : ""
                    }`}
                    aria-label={`${inCart} in bozza`}
                  >
                    {inCart}×
                  </span>
                )}
                <span className={`text-sm font-medium leading-snug ${inCart > 0 ? "pr-8" : ""}`}>
                  {excluded && "🚫 "}
                  {localized(p.name)}
                </span>
                <span className="mt-1 text-xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                  € {price.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-[hsl(var(--pg-border))] overflow-y-auto">
          {products.map((p) => {
            const excluded = isExcluded(p);
            const price = resolvePrice(p, channel, menu.prices ?? []);
            const inCart = cartQtyByProduct[p.id] ?? 0;
            const justAdded = lastAdded?.productId === p.id;
            return (
              <li key={p.id}>
                <button
                  // Chiave nuova a ogni aggiunta per far ripartire l'animazione.
                  key={justAdded ? `added-${lastAdded.seq}` : "product"}
                  type="button"
                  disabled={excluded}
                  onClick={() => onAddProduct(p)}
                  className={`flex min-h-[3.25rem] w-full items-center justify-between px-4 py-3 text-left active:bg-[hsl(var(--pg-muted))]/30 ${
                    excluded ? "pointer-events-none opacity-30" : ""
                  } ${justAdded ? "pg-added-flash" : ""}`}
                >
                  <span className="pr-3 font-medium leading-tight">
                    {excluded && "🚫 "}
                    {localized(p.name)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {inCart > 0 && (
                      <span
                        key={justAdded ? lastAdded.seq : "qty"}
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1.5 text-xs font-bold tabular-nums text-[hsl(var(--pg-primary-foreground))] ${
                          justAdded ? "pg-pop" : ""
                        }`}
                        aria-label={`${inCart} in bozza`}
                      >
                        {inCart}×
                      </span>
                    )}
                    <span className="tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                      € {price.toFixed(2)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
