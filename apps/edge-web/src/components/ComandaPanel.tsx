import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
import { useEdgeWs } from "../lib/ws";
import { ConfirmModal } from "./ConfirmModal";
import { ComandaHelp } from "./ComandaHelp";
import { VariantSheet } from "./VariantSheet";
import {
  buildCartLine,
  cartTotal,
  lineKey,
  localized,
  resolvePrice,
  variantsForProduct,
} from "../lib/order-menu";
import type { CartLine, MenuSnapshot, Product, VariantSelection } from "../lib/order-types";

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
}

interface LiveTable {
  id: string;
  label: string;
  guests?: number;
  defaultGuests?: number;
  isVirtual?: boolean;
  virtualType?: string | null;
}

export function ComandaPanel({
  table,
  operator,
  onClose,
  onSubmitted,
}: {
  table: LiveTable;
  operator: Operator;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { send } = useEdgeWs();
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];

  const loadMenu = useCallback((resetNavigation = false) => {
    void edgeApi<{ snapshot: MenuSnapshot }>("/api/menu").then((m) => {
      const snap = m.snapshot;
      const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setMenu({ ...snap, categories: cats });
      if (resetNavigation && cats[0]) setSelectedCat(cats[0].id);
    });
  }, []);

  const loadDraft = useCallback(async () => {
    const data = await edgeApi<{
      draft: {
        lines: Array<{
          id: string;
          productId: string;
          name: string;
          unitPrice: number;
          basePrice?: number;
          quantity: number;
          variants?: CartLine["variants"];
          course?: number;
          hold?: boolean;
          dessertDefer?: boolean;
        }>;
      } | null;
    }>(`/api/orders?tableId=${table.id}`);
    if (data.draft?.lines) {
      setCart(
        data.draft.lines.map((l) => ({
          lineId: l.id,
          productId: l.productId,
          name: l.name,
          basePrice: l.basePrice ?? l.unitPrice,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          variants: l.variants ?? [],
          course: l.course ?? 1,
          hold: l.hold ?? false,
          dessertDefer: l.dessertDefer ?? false,
          allergenIds: [],
        })),
      );
    } else {
      setCart([]);
    }
  }, [table.id]);

  useEffect(() => {
    loadMenu(true);
    void loadDraft();
  }, [loadMenu, loadDraft]);

  const getChannel = (): "TABLE" | "TAKEAWAY" | "DELIVERY" => {
    if (!table.isVirtual) return "TABLE";
    if (table.virtualType === "DELIVERY") return "DELIVERY";
    return "TAKEAWAY";
  };

  const mergeCartLine = (line: CartLine) => {
    const key = lineKey(line.productId, line.variants);
    setCart((prev) => {
      const existing = prev.find((l) => lineKey(l.productId, l.variants) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l.productId, l.variants) === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, line];
    });
  };

  const addProduct = (product: Product) => {
    if (!menu) return;
    const options = variantsForProduct(product, menu.variantGroups ?? []);
    const channel = getChannel();
    if (options.length > 0) {
      setVariantProduct(product);
      return;
    }
    const category = categories.find((c) => c.id === product.categoryId) ?? {};
    const line = buildCartLine(product, category, channel, menu.prices ?? []);
    if ("error" in line) {
      setMessage(line.error);
      return;
    }
    mergeCartLine(line);
  };

  const confirmVariants = (variants: VariantSelection[]) => {
    if (!variantProduct || !menu) return;
    const category = categories.find((c) => c.id === variantProduct.categoryId) ?? {};
    const channel = getChannel();
    const line = buildCartLine(variantProduct, category, channel, menu.prices ?? [], variants);
    if ("error" in line) {
      setMessage(line.error);
    } else {
      mergeCartLine(line);
    }
    setVariantProduct(null);
  };

  const persistDraft = async () => {
    if (cart.length === 0) return;
    const channel = getChannel();
    await edgeApi("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: table.id,
        operatorId: operator.id,
        operatorName: `${operator.firstName} ${operator.lastName}`,
        channel,
        lines: cart.map((l) => ({
          id: l.lineId,
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          basePrice: l.basePrice,
          channel,
          variants: l.variants,
          course: l.course,
          hold: l.hold,
          dessertDefer: l.dessertDefer,
        })),
      }),
    });
  };

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setMessage("");
    try {
      await persistDraft();
      const channel = getChannel();
      const order = await edgeApi<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: table.id,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
          channel,
          lines: cart.map((l) => ({
            id: l.lineId,
            productId: l.productId,
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            basePrice: l.basePrice,
            channel,
            variants: l.variants,
            course: l.course,
            hold: l.hold,
            dessertDefer: l.dessertDefer,
          })),
        }),
      });

      const result = await edgeApi<{
        ok: boolean;
        kdsTickets?: unknown[];
        orderId: string;
        tableLabel: string;
      }>(`/api/orders/${order.id}/submit`, { method: "POST" });

      if (result.ok) {
        send("ORDER_SUBMIT", {
          tableId: table.id,
          orderId: order.id,
          tableLabel: result.tableLabel,
          kdsTickets: result.kdsTickets,
        });
        send("RELEASE_TABLE_LOCK", { tableId: table.id, operatorId: operator.id });
        setCart([]);
        setConfirmSubmit(false);
        onSubmitted();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore invio");
    } finally {
      setLoading(false);
    }
  };

  const callCourse = async (course: number) => {
    await edgeApi("/api/orders/call-course", {
      method: "POST",
      body: JSON.stringify({ tableId: table.id, course }),
    });
    setMessage(`CHIAMA PORTATA ${course}`);
  };

  const leave = async () => {
    await persistDraft();
    try {
      await edgeApi(`/api/tables/${table.id}/unlock`, {
        method: "POST",
        body: JSON.stringify({ operatorId: operator.id }),
      });
    } catch {
      send("RELEASE_TABLE_LOCK", { tableId: table.id, operatorId: operator.id });
    }
    setConfirmExit(false);
    onClose();
  };

  const channel = getChannel();
  const total = cartTotal(cart);
  const filteredProducts = products.filter((p) => !selectedCat || p.categoryId === selectedCat);
  const productVariants = variantProduct
    ? variantsForProduct(variantProduct, menu?.variantGroups ?? [])
    : [];
  const basePrice = variantProduct
    ? resolvePrice(variantProduct, channel, menu?.prices ?? [])
    : 0;

  if (!menu) {
    return <p className="p-4 text-sm">Caricamento menu...</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{table.label}</h2>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Comanda · {operator.firstName} {operator.lastName}
          </p>
        </div>
        <p className="shrink-0 text-xl font-bold tabular-nums">€ {total.toFixed(2)}</p>
      </header>

      {message && (
        <p className="shrink-0 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/40 px-4 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const active = selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
                  active ? "text-white shadow-sm" : "bg-[hsl(var(--pg-muted))]"
                }`}
                style={active ? { backgroundColor: c.colorHex ?? undefined } : undefined}
              >
                {localized(c.name)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="flex min-h-[72px] flex-col justify-center rounded-xl border border-[hsl(var(--pg-border))] p-3 text-left transition active:scale-[0.98] hover:border-[hsl(var(--pg-primary))]/40"
              >
                <p className="text-sm font-medium leading-snug">{localized(p.name)}</p>
                <p className="mt-1 text-xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                  € {resolvePrice(p, channel, menu.prices ?? []).toFixed(2)}
                </p>
              </button>
            ))}
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/10 lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <h3 className="mb-2 text-sm font-semibold">Carrello ({cart.length})</h3>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {cart.length === 0 ? (
                <li className="py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Nessun articolo
                </li>
              ) : (
                cart.map((l) => (
                  <li
                    key={l.lineId}
                    className="rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">
                        {l.quantity}× {l.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-red-500"
                        onClick={() =>
                          setCart((prev) => prev.filter((x) => x.lineId !== l.lineId))
                        }
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[1, 2, 3, 4].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((x) =>
                                x.lineId === l.lineId ? { ...x, course: c } : x,
                              ),
                            )
                          }
                          className={`min-h-8 min-w-8 rounded px-2 text-xs ${
                            l.course === c
                              ? "bg-[hsl(var(--pg-primary))] text-white"
                              : "bg-[hsl(var(--pg-muted))]"
                          }`}
                        >
                          P{c}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((x) =>
                              x.lineId === l.lineId ? { ...x, hold: !x.hold } : x,
                            ),
                          )
                        }
                        className={`min-h-8 rounded px-2 text-xs ${
                          l.hold ? "bg-orange-500 text-white" : "bg-[hsl(var(--pg-muted))]"
                        }`}
                      >
                        HOLD
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-3 shrink-0 space-y-3 border-t border-[hsl(var(--pg-border))] pt-3">
              <ComandaHelp />
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 4].map((c) => (
                  <Button
                    key={c}
                    className="h-9 flex-1 min-w-[3rem] text-xs"
                    variant="outline"
                    onClick={() => void callCourse(c)}
                  >
                    Chiama P{c}
                  </Button>
                ))}
              </div>
              <Button
                className="h-12 w-full text-base"
                disabled={cart.length === 0 || loading}
                onClick={() => setConfirmSubmit(true)}
              >
                SPEDITO
              </Button>
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => (cart.length > 0 ? setConfirmExit(true) : void leave())}
              >
                ← Torna al conto
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {variantProduct && (
        <VariantSheet
          product={variantProduct}
          variants={productVariants}
          basePrice={basePrice}
          onConfirm={confirmVariants}
          onCancel={() => setVariantProduct(null)}
        />
      )}

      {confirmExit && (
        <ConfirmModal
          title="Uscire dalla comanda?"
          message="La bozza verrà salvata. Il tavolo verrà sbloccato."
          confirmLabel="Esci"
          onConfirm={() => void leave()}
          onCancel={() => setConfirmExit(false)}
        />
      )}

      {confirmSubmit && (
        <ConfirmModal
          title="Inviare in cucina?"
          message={`Confermi SPEDITO per ${cart.length} righe (€ ${total.toFixed(2)})?`}
          confirmLabel="SPEDITO"
          onConfirm={() => void submitOrder()}
          onCancel={() => setConfirmSubmit(false)}
        />
      )}
    </div>
  );
}
