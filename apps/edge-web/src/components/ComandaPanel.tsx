import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
import { useEdgeWs } from "../lib/ws";
import { ConfirmModal } from "./ConfirmModal";
import { VariantSheet } from "./VariantSheet";
import {
  buildCartLine,
  cartTotal,
  lineKey,
  localized,
  resolvePrice,
  variantGroupsForProduct,
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

  const loadMenu = useCallback(() => {
    void edgeApi<{ snapshot: MenuSnapshot }>("/api/menu").then((m) => {
      const snap = m.snapshot;
      const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setMenu({ ...snap, categories: cats });
      if (cats[0]) setSelectedCat(cats[0].id);
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
    loadMenu();
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
    const groups = variantGroupsForProduct(product, menu.variantGroups ?? []);
    const channel = getChannel();
    if (groups.some((g) => g.variants.length > 0)) {
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
    send("CALL_COURSE", { tableId: table.id, course });
    setMessage(`CHIAMA PORTATA ${course}`);
  };

  const leave = async () => {
    await persistDraft();
    send("RELEASE_TABLE_LOCK", { tableId: table.id, operatorId: operator.id });
    setConfirmExit(false);
    onClose();
  };

  const channel = getChannel();
  const total = cartTotal(cart);
  const filteredProducts = products.filter((p) => !selectedCat || p.categoryId === selectedCat);
  const variantGroups = variantProduct
    ? variantGroupsForProduct(variantProduct, menu?.variantGroups ?? [])
    : [];
  const basePrice = variantProduct
    ? resolvePrice(variantProduct, channel, menu?.prices ?? [])
    : 0;

  if (!menu) {
    return <p className="p-4 text-sm">Caricamento menu...</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {message && (
        <p className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-2 text-sm">{message}</p>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-28 shrink-0 overflow-y-auto border-r border-[hsl(var(--pg-border))] p-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCat(c.id)}
              className={`mb-1 w-full rounded-lg px-2 py-2 text-left text-xs ${
                selectedCat === c.id
                  ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  : "bg-[hsl(var(--pg-muted))]"
              }`}
            >
              {localized(c.name)}
            </button>
          ))}
        </aside>

        <section className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 content-start sm:grid-cols-3">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="min-h-[64px] rounded-lg border border-[hsl(var(--pg-border))] p-2 text-left text-sm active:scale-95"
            >
              <p className="font-medium">{localized(p.name)}</p>
              <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                € {resolvePrice(p, channel, menu.prices ?? []).toFixed(2)}
              </p>
            </button>
          ))}
        </section>

        <aside className="flex w-44 shrink-0 flex-col border-l border-[hsl(var(--pg-border))] p-2">
          <h3 className="mb-2 text-sm font-semibold">Carrello</h3>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto text-xs">
            {cart.map((l) => (
              <li key={l.lineId} className="rounded border border-[hsl(var(--pg-border))] p-2">
                <div className="flex justify-between gap-1">
                  <span>{l.quantity}× {l.name}</span>
                  <button type="button" className="text-red-500" onClick={() => setCart((prev) => prev.filter((x) => x.lineId !== l.lineId))}>✕</button>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {[1, 2, 3, 4].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCart((prev) => prev.map((x) => x.lineId === l.lineId ? { ...x, course: c } : x))}
                      className={`rounded px-1 text-[10px] ${l.course === c ? "bg-[hsl(var(--pg-primary))] text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                    >
                      P{c}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCart((prev) => prev.map((x) => x.lineId === l.lineId ? { ...x, hold: !x.hold } : x))}
                    className={`rounded px-1 text-[10px] ${l.hold ? "bg-orange-500 text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                  >
                    HOLD
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mb-2 flex flex-wrap gap-1">
            {[1, 2, 3, 4].map((c) => (
              <Button key={c} className="h-8 px-2 text-[10px]" variant="outline" onClick={() => void callCourse(c)}>
                P{c}
              </Button>
            ))}
          </div>

          <p className="mb-2 text-sm font-bold">€ {total.toFixed(2)}</p>
          <Button className="mb-1 w-full" disabled={cart.length === 0 || loading} onClick={() => setConfirmSubmit(true)}>
            SPEDITO
          </Button>
          <Button variant="outline" className="w-full" onClick={() => (cart.length > 0 ? setConfirmExit(true) : void leave())}>
            ← Indietro
          </Button>
        </aside>
      </div>

      {variantProduct && (
        <VariantSheet
          product={variantProduct}
          groups={variantGroups}
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
