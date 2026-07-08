import { EU_ALLERGENS } from "../constants/allergens";
import { fuzzyMatch, localized, resolvePrice } from "../lib/menu";
import type { Category, MenuSnapshot, Product } from "../lib/types";

export function MenuPanel({
  menu,
  categories,
  selectedCat,
  search,
  allergenFilter,
  channel,
  onSelectCat,
  onSearchChange,
  onAllergenToggle,
  onAddProduct,
}: {
  menu: MenuSnapshot;
  categories: Category[];
  selectedCat: string | null;
  search: string;
  allergenFilter: string[];
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  onSelectCat: (id: string) => void;
  onSearchChange: (v: string) => void;
  onAllergenToggle: (id: string) => void;
  onAddProduct: (p: Product) => void;
}) {
  const products = menu.products.filter((p) => {
    if (selectedCat && p.categoryId !== selectedCat) return false;
    if (search && !fuzzyMatch(localized(p.name), search)) return false;
    return true;
  });

  const isExcluded = (p: Product) =>
    allergenFilter.length > 0 &&
    allergenFilter.some((a) => (p.allergenIds ?? []).includes(a));

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-[hsl(var(--pg-border))] p-3">
        <input
          type="search"
          placeholder="Cerca piatto..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-4 text-sm"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const active = selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCat(c.id)}
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

      <ul className="flex-1 divide-y divide-[hsl(var(--pg-border))] overflow-y-auto">
        {products.map((p) => {
          const excluded = isExcluded(p);
          const price = resolvePrice(p, channel, menu.prices ?? []);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={excluded}
                onClick={() => onAddProduct(p)}
                className={`flex min-h-[3.25rem] w-full items-center justify-between px-4 py-3 text-left active:bg-[hsl(var(--pg-muted))]/30 ${
                  excluded ? "pointer-events-none opacity-30" : ""
                }`}
              >
                <span className="pr-3 font-medium leading-tight">
                  {excluded && "🚫 "}
                  {localized(p.name)}
                </span>
                <span className="shrink-0 tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                  € {price.toFixed(2)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
