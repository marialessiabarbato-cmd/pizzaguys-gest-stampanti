import { Button } from "@pizzaguys/ui";
import { EU_ALLERGENS } from "../constants/allergens";
import { OrderHeader } from "../components/OrderHeader";
import { VariantSheet } from "../components/VariantSheet";
import { fuzzyMatch, localized, resolvePrice } from "../lib/menu";
import type { CartLine, Category, LiveTable, MenuSnapshot, Operator, Product } from "../lib/types";

export function OrderScreen({
  table,
  operator,
  menu,
  categories,
  cart,
  selectedCat,
  search,
  allergenFilter,
  variantProduct,
  productVariants,
  variantBasePrice,
  isOffline,
  message,
  onBack,
  onOpenCart,
  onSelectCat,
  onSearchChange,
  onAllergenToggle,
  onAddProduct,
  onConfirmVariants,
  onCancelVariants,
}: {
  table: LiveTable;
  operator: Operator;
  menu: MenuSnapshot;
  categories: Category[];
  cart: CartLine[];
  selectedCat: string | null;
  search: string;
  allergenFilter: string[];
  variantProduct: Product | null;
  productVariants: import("../lib/types").VariantOption[];
  variantBasePrice: number;
  isOffline: boolean;
  message: string;
  onBack: () => void;
  onOpenCart: () => void;
  onSelectCat: (id: string) => void;
  onSearchChange: (v: string) => void;
  onAllergenToggle: (id: string) => void;
  onAddProduct: (p: Product) => void;
  onConfirmVariants: (variants: import("../lib/types").VariantSelection[]) => void;
  onCancelVariants: () => void;
}) {
  const channel = table.isVirtual
    ? table.virtualType === "DELIVERY"
      ? "DELIVERY"
      : "TAKEAWAY"
    : "TABLE";

  const products = menu.products.filter((p) => {
    if (selectedCat && p.categoryId !== selectedCat) return false;
    if (search && !fuzzyMatch(localized(p.name), search)) return false;
    return true;
  });

  const isExcluded = (p: Product) => {
    if (allergenFilter.length === 0) return false;
    return allergenFilter.some((a) => (p.allergenIds ?? []).includes(a));
  };

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => {
    const d = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
    return sum + l.unitPrice * l.quantity * d;
  }, 0);

  return (
    <main className="flex min-h-screen flex-col">
      {isOffline && (
        <div className="bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-black">
          Offline — bozza salvata localmente. SPEDITO disabilitato.
        </div>
      )}

      <OrderHeader table={table} operator={operator} backLabel="← Indietro" onBack={onBack} />

      {message && (
        <p className="border-b border-[hsl(var(--pg-border))] px-4 py-2 text-sm">{message}</p>
      )}

      <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--pg-border))] p-3">
        <input
          type="search"
          placeholder="Cerca piatto..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="min-h-12 min-w-[160px] flex-1 rounded-lg border border-[hsl(var(--pg-border))] px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {EU_ALLERGENS.slice(0, 6).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAllergenToggle(a.id)}
              className={`min-h-12 rounded-lg px-3 py-2 text-xs ${
                allergenFilter.includes(a.id) ? "bg-red-500 text-white" : "bg-[hsl(var(--pg-muted))]"
              }`}
            >
              −{a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-40 shrink-0 overflow-y-auto border-r border-[hsl(var(--pg-border))] p-2 sm:w-48">
          {categories.map((c) => {
            const active = selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCat(c.id)}
                className={`mb-2 flex min-h-12 w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium transition ${
                  active ? "text-white shadow-md" : "bg-[hsl(var(--pg-muted))]"
                }`}
                style={active ? { backgroundColor: c.colorHex } : { borderLeft: `4px solid ${c.colorHex}` }}
              >
                <span className="line-clamp-2">
                  {localized(c.name)}
                  {c.dessert && " 🍰"}
                </span>
              </button>
            );
          })}
        </aside>

        <section className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 content-start sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => {
            const excluded = isExcluded(p);
            return (
              <button
                key={p.id}
                type="button"
                disabled={excluded}
                onClick={() => onAddProduct(p)}
                className={`min-h-[88px] rounded-xl border border-[hsl(var(--pg-border))] p-4 text-left active:scale-[0.98] ${
                  excluded ? "pointer-events-none opacity-30" : "hover:border-[hsl(var(--pg-primary))]"
                }`}
              >
                <p className="font-semibold leading-tight">
                  {excluded && <span className="mr-1">🚫</span>}
                  {localized(p.name)}
                </p>
                <p className="mt-1 text-sm text-[hsl(var(--pg-muted-foreground))]">
                  € {resolvePrice(p, channel, menu.prices ?? []).toFixed(2)}
                </p>
              </button>
            );
          })}
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <Button
          size="lg"
          className="min-h-14 w-full text-base"
          onClick={onOpenCart}
          disabled={cartCount === 0}
        >
          Carrello{cartCount > 0 ? ` (${cartCount})` : ""}
          {cartCount > 0 && ` — € ${cartTotal.toFixed(2)}`}
        </Button>
      </div>

      {variantProduct && (
        <VariantSheet
          product={variantProduct}
          variants={productVariants}
          basePrice={variantBasePrice}
          onConfirm={onConfirmVariants}
          onCancel={onCancelVariants}
        />
      )}
    </main>
  );
}
