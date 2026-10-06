import { calculateLinePrice } from "@pizzaguys/fiscal";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { edgeApi } from "../lib/api";
import { useEdgeWs } from "../lib/ws";
import { ConfirmModal } from "./ConfirmModal";
import { ComandaHelp } from "./ComandaHelp";
import { NotePanel } from "./NotePanel";
import { VariantSheet } from "./VariantSheet";
import {
  buildCartLine,
  cartTotal,
  fuzzyMatch,
  lineKey,
  localized,
  resolvePrice,
  variantsForProduct,
} from "../lib/order-menu";
import { isOraCourse, ORDER_STEPS, normalizeCourse } from "../lib/course";
import type { CartLine, MenuSnapshot, Product, VariantSelection } from "../lib/order-types";

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
}

/** Ultimo piatto aggiunto: guida avviso, evidenziazione riga e contatore sul prodotto. */
interface LastAdded {
  seq: number;
  lineId: string;
  productId: string;
  name: string;
  course: number;
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
  shiftInactive = false,
  onClose,
  onSubmitted,
}: {
  table: LiveTable;
  operator: Operator;
  /** Nessun turno cassa aperto: l'invio è bloccato anche lato edge. */
  shiftInactive?: boolean;
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
  const [editCartLine, setEditCartLine] = useState<CartLine | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  /** Portata in cui entrano i piatti toccati nel menu. */
  const [activeCourse, setActiveCourse] = useState(1);
  const [search, setSearch] = useState("");
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);
  const [addedToast, setAddedToast] = useState<LastAdded | null>(null);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const cartListRef = useRef<HTMLUListElement>(null);

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
          notes?: string;
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
          notes: l.notes,
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

  // Avviso temporaneo e riga aggiunta portata in vista nel carrello.
  useEffect(() => {
    if (!lastAdded) return;
    setAddedToast(lastAdded);
    const frame = requestAnimationFrame(() => {
      cartListRef.current
        ?.querySelector(`[data-line-id="${lastAdded.lineId}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setAddedToast(null), 3500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [lastAdded]);

  const mergeCartLine = (line: CartLine) => {
    const key = lineKey(line.productId, line.variants, line.course);
    // L'id da evidenziare va calcolato prima di setCart: l'updater può girare dopo.
    const focusId =
      cart.find((l) => lineKey(l.productId, l.variants, l.course) === key)?.lineId ?? line.lineId;
    setCart((prev) => {
      const existing = prev.find((l) => lineKey(l.productId, l.variants, l.course) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l.productId, l.variants, l.course) === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, line];
    });
    setLastAdded((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      lineId: focusId,
      productId: line.productId,
      name: line.name,
      course: line.course,
    }));
  };

  /** −/+ sulla riga: a zero la riga sparisce. */
  const changeQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const undoLastAdded = () => {
    if (addedToast) changeQty(addedToast.lineId, -1);
    setAddedToast(null);
  };

  const saveNote = (lineId: string, note: string) => {
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, notes: note || undefined } : l)),
    );
    setNoteLineId(null);
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
    const line = buildCartLine(product, category, channel, menu.prices ?? [], [], activeCourse);
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
    const line = buildCartLine(
      variantProduct,
      category,
      channel,
      menu.prices ?? [],
      variants,
      activeCourse,
    );
    if ("error" in line) {
      setMessage(line.error);
    } else {
      mergeCartLine(line);
    }
    setVariantProduct(null);
  };

  const editLineVariants = (line: CartLine) => {
    if (!menu) return;
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    const options = variantsForProduct(product, menu.variantGroups ?? []);
    if (options.length === 0) {
      setMessage("Questo prodotto non ha varianti da modificare");
      return;
    }
    setEditCartLine(line);
  };

  const saveLineVariants = (variants: VariantSelection[]) => {
    if (!editCartLine) return;
    const unitPrice = calculateLinePrice(
      editCartLine.basePrice,
      variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
    );
    if (unitPrice <= 0) {
      setMessage("Prezzo riga non valido (vincolo fiscale)");
      return;
    }
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === editCartLine.lineId ? { ...l, variants, unitPrice } : l,
      ),
    );
    setEditCartLine(null);
    setMessage("");
  };

  const linesPayload = (channel: "TABLE" | "TAKEAWAY" | "DELIVERY") =>
    cart.map((l) => ({
      id: l.lineId,
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      basePrice: l.basePrice,
      channel,
      notes: l.notes,
      variants: l.variants,
      course: l.course,
      hold: l.hold,
      dessertDefer: l.dessertDefer,
    }));

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
        lines: linesPayload(channel),
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
          lines: linesPayload(channel),
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
    setMessage(`CHIAMA ${ORDER_STEPS.find((s) => s.course === course)?.label ?? `P${course}`}`);
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
  // Con una ricerca attiva si cerca in tutto il menu, ignorando la categoria.
  const filteredProducts = search.trim()
    ? products.filter((p) => fuzzyMatch(localized(p.name), search))
    : products.filter((p) => !selectedCat || p.categoryId === selectedCat);
  const cartPieces = cart.reduce((n, l) => n + l.quantity, 0);
  const qtyByProduct = cart.reduce<Record<string, number>>((acc, l) => {
    acc[l.productId] = (acc[l.productId] ?? 0) + l.quantity;
    return acc;
  }, {});
  const noteLine = cart.find((l) => l.lineId === noteLineId) ?? null;
  const toastQty = addedToast
    ? (cart.find((l) => l.lineId === addedToast.lineId)?.quantity ?? 0)
    : 0;
  const productVariants = variantProduct
    ? variantsForProduct(variantProduct, menu?.variantGroups ?? [])
    : [];
  const editProduct = editCartLine
    ? products.find((p) => p.id === editCartLine.productId) ?? null
    : null;
  const editProductVariants = editProduct
    ? variantsForProduct(editProduct, menu?.variantGroups ?? [])
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

      <div className="shrink-0 space-y-2 border-b border-[hsl(var(--pg-border))] px-3 pb-2 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 gap-1 rounded-xl bg-[hsl(var(--pg-muted))] p-1" role="radiogroup" aria-label="Portata dei piatti aggiunti">
            {ORDER_STEPS.map((step) => {
              const active = activeCourse === step.course;
              return (
                <button
                  key={step.course}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={step.hint}
                  onClick={() => setActiveCourse(step.course)}
                  className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition ${
                    active
                      ? "bg-[hsl(var(--pg-primary))] text-white shadow-sm"
                      : "text-[hsl(var(--pg-muted-foreground))]"
                  }`}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca piatto..."
            aria-label="Cerca piatto"
            className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 text-sm outline-none focus:border-[hsl(var(--pg-primary))]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const active = !search.trim() && selectedCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCat(c.id);
                  setSearch("");
                }}
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
        <div className="relative flex min-h-0 flex-1 flex-col">
          <section className="min-h-0 flex-1 overflow-y-auto p-3">
            {filteredProducts.length === 0 && (
              <p className="py-10 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                Nessun piatto trovato
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filteredProducts.map((p) => {
                const inCart = qtyByProduct[p.id] ?? 0;
                const justAdded = lastAdded?.productId === p.id;
                return (
                  <button
                    // Chiave nuova a ogni aggiunta per far ripartire l'animazione.
                    key={justAdded ? `${p.id}-${lastAdded.seq}` : p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className={`relative flex min-h-[72px] flex-col justify-center rounded-xl border p-3 text-left transition active:scale-[0.98] hover:border-[hsl(var(--pg-primary))]/40 ${
                      inCart > 0
                        ? "border-[hsl(var(--pg-primary))]/50"
                        : "border-[hsl(var(--pg-border))]"
                    } ${justAdded ? "pg-added-flash" : ""}`}
                  >
                    {inCart > 0 && (
                      <span
                        key={justAdded ? lastAdded.seq : "qty"}
                        className={`absolute right-2 top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1.5 text-xs font-bold tabular-nums text-white ${
                          justAdded ? "pg-pop" : ""
                        }`}
                        aria-label={`${inCart} nel carrello`}
                      >
                        {inCart}×
                      </span>
                    )}
                    <p className={`text-sm font-medium leading-snug ${inCart > 0 ? "pr-8" : ""}`}>
                      {localized(p.name)}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                      € {resolvePrice(p, channel, menu.prices ?? []).toFixed(2)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {addedToast && toastQty > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
              <div
                key={addedToast.seq}
                role="status"
                aria-live="polite"
                className="pg-toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-[hsl(var(--pg-foreground))] py-2 pl-4 pr-2 text-sm text-[hsl(var(--pg-background))] shadow-lg"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">✓ {addedToast.name}</span>
                  <span className="block text-xs opacity-80">
                    {ORDER_STEPS.find((st) => st.course === normalizeCourse(addedToast.course))?.label}
                    {toastQty > 1 ? ` · ${toastQty} nel carrello` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={undoLastAdded}
                  className="min-h-10 shrink-0 rounded-lg px-3 font-semibold text-[hsl(var(--pg-primary))]"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/10 lg:w-80 lg:border-l lg:border-t-0 xl:w-[26rem]">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <h3 className="mb-2 text-sm font-semibold">
              Carrello ({cartPieces} {cartPieces === 1 ? "pezzo" : "pezzi"})
            </h3>
            <ul ref={cartListRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {cart.length === 0 ? (
                <li className="py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Nessun articolo
                </li>
              ) : (
                cart.map((l) => {
                  const justAdded = lastAdded?.lineId === l.lineId;
                  return (
                    <li
                      // Chiave nuova a ogni aggiunta per far ripartire l'animazione.
                      key={justAdded ? `${l.lineId}-${lastAdded.seq}` : l.lineId}
                      data-line-id={l.lineId}
                      className={`rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 text-sm ${
                        justAdded ? "pg-added-flash" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">
                            {l.quantity}× {l.name}
                          </span>
                          {l.variants.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {l.variants.map((v) => (
                                <li key={v.variantId} className={v.type === "REMOVE" ? "text-red-600" : ""}>
                                  {v.type === "REMOVE" ? `− ${v.name}` : `+ ${v.name}`}
                                </li>
                              ))}
                            </ul>
                          )}
                          {l.notes && (
                            <p className="mt-1 break-words text-xs font-medium italic text-amber-700">
                              Nota: {l.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label={l.quantity === 1 ? `Elimina ${l.name}` : `Togli un ${l.name}`}
                            onClick={() => changeQty(l.lineId, -1)}
                            className={`h-11 w-11 rounded-xl text-lg font-semibold ${
                              l.quantity === 1 ? "bg-red-500/10 text-red-600" : "bg-[hsl(var(--pg-muted))]"
                            }`}
                          >
                            {l.quantity === 1 ? "✕" : "−"}
                          </button>
                          <button
                            type="button"
                            aria-label={`Aggiungi un ${l.name}`}
                            onClick={() => changeQty(l.lineId, 1)}
                            className="h-11 w-11 rounded-xl bg-[hsl(var(--pg-muted))] text-lg font-semibold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setNoteLineId(l.lineId)}
                          className={`min-h-10 rounded-xl px-2.5 text-sm font-medium ${
                            l.notes ? "bg-amber-500/15 text-amber-800" : "bg-[hsl(var(--pg-muted))]"
                          }`}
                        >
                          Nota
                        </button>
                        {(() => {
                          const product = products.find((p) => p.id === l.productId);
                          if (!product || variantsForProduct(product, menu.variantGroups ?? []).length === 0) {
                            return null;
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => editLineVariants(l)}
                              className="min-h-10 rounded-xl bg-[hsl(var(--pg-muted))] px-2.5 text-sm font-medium"
                            >
                              Modifica
                            </button>
                          );
                        })()}
                        {ORDER_STEPS.map((step) => {
                          const active = normalizeCourse(l.course) === step.course;
                          return (
                            <button
                              key={step.course}
                              type="button"
                              title={step.hint}
                              onClick={() =>
                                setCart((prev) =>
                                  prev.map((x) =>
                                    x.lineId === l.lineId
                                      ? {
                                          ...x,
                                          course: step.course,
                                          hold: isOraCourse(step.course)
                                            ? false
                                            : x.hold || true,
                                        }
                                      : x,
                                  ),
                                )
                              }
                              className={`min-h-10 min-w-10 rounded-xl px-2 text-sm font-semibold ${
                                active
                                  ? "bg-[hsl(var(--pg-primary))] text-white"
                                  : "bg-[hsl(var(--pg-muted))]"
                              }`}
                            >
                              {step.shortLabel}
                            </button>
                          );
                        })}
                        {!isOraCourse(l.course) && (
                          <button
                            type="button"
                            onClick={() =>
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.lineId === l.lineId ? { ...x, hold: !x.hold } : x,
                                ),
                              )
                            }
                            className={`min-h-10 rounded-xl px-2.5 text-sm font-semibold ${
                              l.hold ? "bg-orange-500 text-white" : "bg-[hsl(var(--pg-muted))]"
                            }`}
                          >
                            {l.hold ? "HOLD" : "Via"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="mt-3 shrink-0 space-y-3 border-t border-[hsl(var(--pg-border))] pt-3">
              <ComandaHelp />
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ORDER_STEPS.map((step) => (
                  <Button
                    key={step.course}
                    className="min-h-10 px-1 text-xs font-semibold"
                    variant="outline"
                    onClick={() => void callCourse(step.course)}
                  >
                    {step.callLabel}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button
                  variant="outline"
                  className="h-12 px-4"
                  onClick={() => (cart.length > 0 ? setConfirmExit(true) : void leave())}
                >
                  ← Conto
                </Button>
                <Button
                  className="h-12 text-base"
                  disabled={cart.length === 0 || loading || shiftInactive}
                  onClick={() => setConfirmSubmit(true)}
                >
                  {shiftInactive ? "SPEDITO — turno non attivo" : "SPEDITO"}
                </Button>
              </div>
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

      {editProduct && editCartLine && (
        <VariantSheet
          product={editProduct}
          variants={editProductVariants}
          basePrice={editCartLine.basePrice}
          initialVariants={editCartLine.variants}
          confirmLabel="Salva"
          onConfirm={saveLineVariants}
          onCancel={() => setEditCartLine(null)}
        />
      )}

      {noteLine && (
        <NotePanel
          lineName={noteLine.name}
          initialNote={noteLine.notes}
          onSave={(note) => saveNote(noteLine.lineId, note)}
          onCancel={() => setNoteLineId(null)}
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
          message={`Confermi SPEDITO per ${cartPieces} ${cartPieces === 1 ? "pezzo" : "pezzi"} (€ ${total.toFixed(2)})?`}
          confirmLabel="SPEDITO"
          onConfirm={() => void submitOrder()}
          onCancel={() => setConfirmSubmit(false)}
        />
      )}
    </div>
  );
}
