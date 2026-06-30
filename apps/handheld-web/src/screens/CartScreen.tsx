import { Button } from "@pizzaguys/ui";
import { useRef } from "react";
import { ComandaHelp } from "../components/ComandaHelp";
import { OrderHeader } from "../components/OrderHeader";
import { VariantSheet } from "../components/VariantSheet";
import { courseLabel, groupCartByCourse, isCourseOnHold } from "../lib/course";
import { cartTotal, localized, variantsForProduct } from "../lib/menu";
import type {
  CartLine,
  LiveTable,
  MenuSnapshot,
  Operator,
  Product,
  VariantSelection,
} from "../lib/types";

const COURSE_OPTIONS = [0, 1, 2, 3];

export function CartScreen({
  table,
  operator,
  menu,
  cart,
  isOffline,
  message,
  editLine,
  editProduct,
  onBack,
  onUpdateCart,
  onSubmit,
  onDiscountLine,
  onEditVariants,
  onConfirmEditVariants,
  onCancelEditVariants,
}: {
  table: LiveTable;
  operator: Operator;
  menu: MenuSnapshot;
  cart: CartLine[];
  isOffline: boolean;
  message: string;
  editLine: CartLine | null;
  editProduct: Product | null;
  onBack: () => void;
  onUpdateCart: (updater: (prev: CartLine[]) => CartLine[]) => void;
  onSubmit: () => void;
  onDiscountLine: (lineId: string) => void;
  onEditVariants: (line: CartLine) => void;
  onConfirmEditVariants: (variants: VariantSelection[]) => void;
  onCancelEditVariants: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groups = groupCartByCourse(cart);
  const total = cartTotal(cart);
  const guests = table.guests ?? table.defaultGuests ?? 0;
  const canSubmit = cart.length > 0 && !isOffline && (table.isVirtual || guests > 0);

  const setCourseHold = (course: number, hold: boolean) => {
    onUpdateCart((prev) => prev.map((l) => (l.course === course ? { ...l, hold } : l)));
  };

  const startLongPress = (line: CartLine) => {
    longPressTimer.current = setTimeout(() => onEditVariants(line), 450);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const productVariants = editProduct
    ? variantsForProduct(editProduct, menu.variantGroups ?? [])
    : [];

  return (
    <main className="flex min-h-screen flex-col">
      <OrderHeader table={table} operator={operator} backLabel="← Comanda" onBack={onBack} />

      {message && (
        <p className="border-b border-[hsl(var(--pg-border))] px-4 py-2 text-sm">{message}</p>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <p className="py-12 text-center text-[hsl(var(--pg-muted-foreground))]">
            Il carrello è vuoto. Torna alla comanda per aggiungere piatti.
          </p>
        ) : (
          [...groups.entries()].map(([course, lines]) => {
            const onHold = isCourseOnHold(lines);
            const sectionTotal = lines.reduce((s, l) => {
              const d = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
              return s + l.unitPrice * l.quantity * d;
            }, 0);
            return (
              <section key={course} className="mb-6">
                <div className="mb-3 flex items-center justify-between rounded-lg bg-[hsl(var(--pg-muted))] px-4 py-3">
                  <h2 className="font-bold tracking-wide">— {courseLabel(course).toUpperCase()} —</h2>
                  <label className="flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium">
                    <span className={onHold ? "text-orange-600" : ""}>HOLD</span>
                    <input
                      type="checkbox"
                      checked={onHold}
                      onChange={(e) => setCourseHold(course, e.target.checked)}
                      className="h-6 w-11 accent-orange-500"
                    />
                  </label>
                </div>

                <ul className="space-y-3">
                  {lines.map((l) => {
                    const lineTotal =
                      l.unitPrice * l.quantity * (l.discountPercent ? 1 - l.discountPercent / 100 : 1);
                    return (
                      <li
                        key={l.lineId}
                        className="rounded-xl border border-[hsl(var(--pg-border))] p-4"
                        onTouchStart={() => startLongPress(l)}
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        onMouseDown={() => startLongPress(l)}
                        onMouseUp={cancelLongPress}
                        onMouseLeave={cancelLongPress}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-semibold">{l.name}</p>
                            {l.variants.length > 0 && (
                              <ul className="mt-1 space-y-0.5 text-sm text-[hsl(var(--pg-muted-foreground))]">
                                {l.variants.map((v) => (
                                  <li key={v.variantId} className={v.type === "REMOVE" ? "text-red-600" : ""}>
                                    {v.type === "REMOVE" ? `− ${v.name}` : `+ ${v.name}`}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {l.dessertDefer && (
                              <p className="mt-1 text-xs text-pink-600">Dolce differito (X DOLCE)</p>
                            )}
                            {l.discountPercent ? (
                              <p className="mt-1 text-xs text-green-600">Sconto −{l.discountPercent}%</p>
                            ) : null}
                          </div>
                          <p className="shrink-0 font-bold">€ {lineTotal.toFixed(2)}</p>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="flex items-center rounded-lg border border-[hsl(var(--pg-border))]">
                            <button
                              type="button"
                              className="min-h-12 min-w-12 text-xl font-bold"
                              onClick={() =>
                                onUpdateCart((prev) =>
                                  prev
                                    .map((x) =>
                                      x.lineId === l.lineId
                                        ? { ...x, quantity: Math.max(0, x.quantity - 1) }
                                        : x,
                                    )
                                    .filter((x) => x.quantity > 0),
                                )
                              }
                            >
                              −
                            </button>
                            <span className="min-w-10 text-center font-semibold">{l.quantity}</span>
                            <button
                              type="button"
                              className="min-h-12 min-w-12 text-xl font-bold"
                              onClick={() =>
                                onUpdateCart((prev) =>
                                  prev.map((x) =>
                                    x.lineId === l.lineId ? { ...x, quantity: x.quantity + 1 } : x,
                                  ),
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {COURSE_OPTIONS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() =>
                                  onUpdateCart((prev) =>
                                    prev.map((x) =>
                                      x.lineId === l.lineId
                                        ? { ...x, course: c, hold: c > 0 ? x.hold : false }
                                        : x,
                                    ),
                                  )
                                }
                                className={`min-h-10 rounded-lg px-3 text-xs font-medium ${
                                  l.course === c
                                    ? "bg-[hsl(var(--pg-primary))] text-white"
                                    : "bg-[hsl(var(--pg-muted))]"
                                }`}
                              >
                                {courseLabel(c)}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => onDiscountLine(l.lineId)}
                            className="min-h-10 rounded-lg bg-[hsl(var(--pg-muted))] px-4 text-sm font-medium"
                          >
                            Sconto %
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateCart((prev) => prev.filter((x) => x.lineId !== l.lineId))
                            }
                            className="min-h-10 rounded-lg px-3 text-red-600"
                          >
                            Elimina
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-right text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Subtotale {courseLabel(course)}: € {sectionTotal.toFixed(2)}
                </p>
              </section>
            );
          })
        )}

        <div className="mt-4">
          <ComandaHelp context="cart" />
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-4">
        <p className="mb-3 text-center text-2xl font-bold">Totale € {total.toFixed(2)}</p>
        <Button
          size="lg"
          className="min-h-14 w-full text-lg"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {isOffline ? "OFFLINE" : "SPEDITO"}
        </Button>
        {!table.isVirtual && guests <= 0 && cart.length > 0 && (
          <p className="mt-2 text-center text-xs text-red-600">Imposta i coperti prima di SPEDITO</p>
        )}
      </div>

      {editProduct && editLine && (
        <VariantSheet
          product={editProduct}
          variants={productVariants}
          basePrice={editLine.basePrice}
          initialVariants={editLine.variants}
          confirmLabel="Salva"
          onConfirm={onConfirmEditVariants}
          onCancel={onCancelEditVariants}
        />
      )}
    </main>
  );
}
