import type { TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuestsModal } from "./components/GuestsModal";
import { PinPad } from "./components/PinPad";
import { PinModal } from "./components/PinModal";
import { VariantSheet } from "./components/VariantSheet";
import { EU_ALLERGENS } from "./constants/allergens";
import { edgeApi } from "./lib/api";
import {
  buildCartLine,
  cartTotal,
  fuzzyMatch,
  lineKey,
  localized,
  resolvePrice,
  variantGroupsForProduct,
} from "./lib/menu";
import { clearDraft, loadDraft, saveDraft } from "./lib/offline";
import type {
  CartLine,
  LiveTable,
  MenuSnapshot,
  Operator,
  Product,
  Screen,
  SubmittedLine,
  VariantSelection,
} from "./lib/types";
import { useEdgeWs } from "./lib/ws";

const STATUS_COLORS: Record<TableStatus, string> = {
  FREE: "bg-green-500",
  OCCUPIED: "bg-blue-500",
  LOCKED: "bg-red-500",
  BILL_REQUESTED: "bg-yellow-500 animate-pulse",
  SPLIT_IN_PROGRESS: "bg-purple-500",
};

type PinModalMode = "unlock" | "discount" | "storno" | null;

export default function App() {
  const { connected, send, on } = useEdgeWs();
  const [online, setOnline] = useState(navigator.onLine);
  const [screen, setScreen] = useState<Screen>("pin");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [activeTable, setActiveTable] = useState<LiveTable | null>(null);
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submittedLines, setSubmittedLines] = useState<SubmittedLine[]>([]);
  const [message, setMessage] = useState("");
  const [lockPending, setLockPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [allergenFilter, setAllergenFilter] = useState<string[]>([]);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [pinModal, setPinModal] = useState<PinModalMode>(null);
  const [pinModalError, setPinModalError] = useState("");
  const [pendingUnlockTable, setPendingUnlockTable] = useState<LiveTable | null>(null);
  const [pendingGuestsTable, setPendingGuestsTable] = useState<LiveTable | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [unlockOverridePin, setUnlockOverridePin] = useState<string | undefined>();
  const [pendingDiscountLine, setPendingDiscountLine] = useState<string | null>(null);
  const [pendingStorno, setPendingStorno] = useState<SubmittedLine | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const cartDirty = useRef(false);

  const isOffline = !connected || !online;
  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];
  const settings = menu?.settings ?? { maxDiscountPercent: 20, tableLockTimeoutMinutes: 15 };

  const loadTables = useCallback(() => {
    void edgeApi<LiveTable[]>("/api/tables/live").then(setTables);
  }, []);

  const loadMenu = useCallback(() => {
    void edgeApi<{ snapshot: MenuSnapshot }>("/api/menu").then((m) => {
      const snap = m.snapshot;
      const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setMenu({ ...snap, categories: cats });
      if (cats[0]) setSelectedCat(cats[0].id);
    });
  }, []);

  const loadDraftForTable = useCallback(async (tableId: string) => {
    if (isOffline) {
      const local = await loadDraft(tableId);
      if (local) setCart(local.cart);
      return;
    }
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
          discountPercent?: number;
          discountToken?: string;
        }>;
      } | null;
      submitted: Array<{
        id: string;
        lines: Array<{
          id: string;
          name: string;
          quantity: number;
          voidedQuantity?: number;
        }>;
      }>;
    }>(`/api/orders?tableId=${tableId}`);
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
          discountPercent: l.discountPercent,
          discountToken: l.discountToken,
          allergenIds: [],
        })),
      );
    } else {
      setCart([]);
    }
    const submitted: SubmittedLine[] = [];
    for (const order of data.submitted ?? []) {
      for (const line of order.lines) {
        submitted.push({
          orderId: order.id,
          lineId: line.id,
          name: line.name,
          quantity: line.quantity,
          voidedQuantity: line.voidedQuantity,
        });
      }
    }
    setSubmittedLines(submitted);
  }, [isOffline]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (screen === "map") loadTables();
  }, [screen, loadTables]);

  useEffect(() => {
    if (!activeTable || cart.length === 0) return;
    cartDirty.current = true;
    void saveDraft(activeTable.id, cart, operator?.id ?? "");
  }, [cart, activeTable, operator]);

  useEffect(() => {
    const unsub1 = on("TABLE_LOCKED_BROADCAST", () => loadTables());
    const unsub2 = on("TABLE_STATUS_UPDATE", () => loadTables());
    const unsub3 = on("LOCK_GRANTED", (payload) => {
      const p = payload as { tableId: string; guests?: number };
      const table = tables.find((t) => t.id === p.tableId);
      if (table && operator) {
        setActiveTable({ ...table, status: "LOCKED", guests: p.guests ?? table.guests });
        void loadDraftForTable(p.tableId);
        loadMenu();
        setScreen("order");
      }
      setLockPending(null);
      setPendingUnlockTable(null);
      setPendingGuestsTable(null);
      setUnlockOverridePin(undefined);
    });
    const unsub4 = on("LOCK_DENIED", (payload) => {
      const p = payload as { reason?: string };
      setMessage(p.reason ?? "Lock negato");
      setLockPending(null);
    });
    const unsub5 = on("PAYMENT_COMPLETE", (payload) => {
      const p = payload as { tableId: string };
      if (activeTable?.id === p.tableId) {
        setMessage("Pagamento completato dalla cassa");
        setCart([]);
        setSubmittedLines([]);
        setScreen("map");
        loadTables();
      } else {
        loadTables();
      }
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [on, loadTables, tables, operator, loadMenu, loadDraftForTable, activeTable]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (screen === "order" && cart.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [screen, cart]);

  const verifyPin = async (value: string) => {
    setPinError("");
    try {
      const op = await edgeApi<Operator>("/api/staff/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin: value }),
      });
      setOperator(op);
      setPin("");
      setScreen("map");
    } catch {
      setPinError("PIN errato");
      setPin("");
    }
  };

  const requestLock = (table: LiveTable, overridePin?: string, guests?: number) => {
    if (!operator) return;
    setLockPending(table.id);
    send("REQUEST_TABLE_LOCK", {
      tableId: table.id,
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
      overridePin,
      guests,
    });
  };

  const openGuestsModal = (table: LiveTable) => {
    setGuestCount(table.guests ?? table.defaultGuests ?? 2);
    setPendingGuestsTable(table);
  };

  const confirmGuests = () => {
    if (!pendingGuestsTable) return;
    requestLock(pendingGuestsTable, unlockOverridePin, guestCount);
    setPendingGuestsTable(null);
    setUnlockOverridePin(undefined);
  };

  const enterTable = (table: LiveTable, overridePin?: string) => {
    if (!table.isVirtual && table.status === "FREE") {
      if (overridePin) setUnlockOverridePin(overridePin);
      openGuestsModal(table);
      return;
    }
    requestLock(table, overridePin);
  };

  const reenterTable = (table: LiveTable) => {
    setActiveTable(table);
    void loadDraftForTable(table.id);
    loadMenu();
    setScreen("order");
  };

  const selectTable = (table: LiveTable) => {
    if (!operator) return;
    if (table.status === "LOCKED" && table.lockedBy === operator.id) {
      reenterTable(table);
      return;
    }
    if (table.status === "LOCKED" && table.lockedBy !== operator.id) {
      setPendingUnlockTable(table);
      setPinModal("unlock");
      return;
    }
    if (table.isVirtual) {
      requestLock(table, undefined, 1);
      return;
    }
    enterTable(table);
  };

  const handleUnlockPin = (value: string) => {
    if (!operator || !pendingUnlockTable) return;
    setPinModalError("");
    setPinModal(null);
    const table = pendingUnlockTable;
    setPendingUnlockTable(null);
    enterTable(table, value);
  };

  const getChannel = (): "TABLE" | "TAKEAWAY" | "DELIVERY" => {
    if (!activeTable?.isVirtual) return "TABLE";
    if (activeTable.virtualType === "DELIVERY") return "DELIVERY";
    return "TAKEAWAY";
  };

  const addProduct = (product: Product) => {
    if (!menu) return;
    const groups = variantGroupsForProduct(product, menu.variantGroups ?? []);
    const channel = getChannel();
    const basePrice = resolvePrice(product, channel, menu.prices ?? []);

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
    if (!operator || !activeTable || cart.length === 0) return;
    const channel = getChannel();
    await edgeApi("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: activeTable.id,
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
          discountPercent: l.discountPercent,
          discountToken: l.discountToken,
        })),
      }),
    });
    await saveDraft(activeTable.id, cart, operator.id);
  };

  const submitOrder = async () => {
    if (!operator || !activeTable || cart.length === 0) return;
    if (isOffline) {
      setMessage("Offline — SPEDITO disabilitato. Bozza salvata localmente.");
      await saveDraft(activeTable.id, cart, operator.id);
      return;
    }

    const invalid = cart.find((l) => l.unitPrice <= 0);
    if (invalid) {
      setMessage(`Prezzo non valido: ${invalid.name}`);
      return;
    }

    await persistDraft();
    const channel = getChannel();
    const order = await edgeApi<{ id: string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: activeTable.id,
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
          discountPercent: l.discountPercent,
          discountToken: l.discountToken,
        })),
      }),
    });

    const result = await edgeApi<{
      ok: boolean;
      kdsTickets?: unknown[];
      orderId: string;
      tableId: string;
      tableLabel: string;
    }>(`/api/orders/${order.id}/submit`, { method: "POST" });

    if (result.ok) {
      send("ORDER_SUBMIT", {
        tableId: activeTable.id,
        orderId: order.id,
        tableLabel: result.tableLabel,
        kdsTickets: result.kdsTickets,
      });
      setMessage("SPEDITO — comanda inviata in cucina");
      await clearDraft(activeTable.id);
      send("RELEASE_TABLE_LOCK", { tableId: activeTable.id, operatorId: operator.id });
      setActiveTable(null);
      setCart([]);
      cartDirty.current = false;
      setScreen("map");
      loadTables();
    }
  };

  const callCourse = async (course: number) => {
    if (!activeTable || isOffline) return;
    await edgeApi("/api/orders/call-course", {
      method: "POST",
      body: JSON.stringify({ tableId: activeTable.id, course }),
    });
    send("CALL_COURSE", { tableId: activeTable.id, course });
    setMessage(`Portata ${course} chiamata`);
  };

  const releaseDessert = async () => {
    if (!activeTable || isOffline) return;
    await edgeApi("/api/orders/release-dessert", {
      method: "POST",
      body: JSON.stringify({ tableId: activeTable.id }),
    });
    setMessage("X DOLCE — dolci inviati in cucina");
  };

  const requestPayment = () => {
    if (!operator || !activeTable || isOffline) return;
    send("REQUEST_PAYMENT", {
      tableId: activeTable.id,
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
    });
    setMessage("Pagamento richiesto — cassa notificata");
    loadTables();
  };

  const applyDiscount = async (pin: string) => {
    if (!pendingDiscountLine) return;
    setPinModalError("");
    try {
      const line = cart.find((l) => l.lineId === pendingDiscountLine);
      if (!line) return;
      const percent = line.discountPercent ?? settings.maxDiscountPercent;
      const auth = await edgeApi<{ token: string; percent: number }>("/api/staff/authorize-discount", {
        method: "POST",
        body: JSON.stringify({ managerPin: pin, discountPercent: percent }),
      });
      setCart((prev) =>
        prev.map((l) =>
          l.lineId === pendingDiscountLine
            ? { ...l, discountPercent: auth.percent, discountToken: auth.token }
            : l,
        ),
      );
      setPinModal(null);
      setPendingDiscountLine(null);
      setMessage(`Sconto ${auth.percent}% autorizzato`);
    } catch {
      setPinModalError("PIN non valido o sconto rifiutato");
    }
  };

  const executeStorno = async (pin: string) => {
    if (!pendingStorno) return;
    setPinModalError("");
    try {
      await edgeApi(`/api/orders/${pendingStorno.orderId}/storno`, {
        method: "POST",
        body: JSON.stringify({ lineId: pendingStorno.lineId, managerPin: pin }),
      });
      setSubmittedLines((prev) =>
        prev.map((l) =>
          l.lineId === pendingStorno.lineId
            ? { ...l, voidedQuantity: (l.voidedQuantity ?? 0) + 1 }
            : l,
        ),
      );
      setPinModal(null);
      setPendingStorno(null);
      setMessage("Storno inviato — ticket ANNULLO stampato");
    } catch {
      setPinModalError("Storno rifiutato — verifica PIN manager");
    }
  };

  const leaveOrder = () => {
    if (cart.length > 0 && !exitConfirm) {
      setExitConfirm(true);
      return;
    }
    if (operator && activeTable) {
      void persistDraft();
      send("RELEASE_TABLE_LOCK", { tableId: activeTable.id, operatorId: operator.id });
    }
    setExitConfirm(false);
    setScreen("map");
    setActiveTable(null);
  };

  const logout = () => {
    setOperator(null);
    setScreen("pin");
    setActiveTable(null);
    setCart([]);
  };

  const filteredProducts = products.filter((p) => {
    if (selectedCat && p.categoryId !== selectedCat) return false;
    if (search && !fuzzyMatch(localized(p.name), search)) return false;
    if (allergenFilter.length > 0) {
      const ids = p.allergenIds ?? [];
      if (allergenFilter.some((a) => ids.includes(a))) return false;
    }
    return true;
  });

  if (screen === "pin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <h1 className="mb-8 text-2xl font-bold">Pizza Guys — Sala</h1>
        <PinPad pin={pin} onChange={setPin} onComplete={(v) => void verifyPin(v)} error={pinError} />
        <p className={`mt-6 text-xs ${connected ? "text-green-600" : "text-yellow-600"}`}>
          {connected ? "Connesso all'edge" : "Connessione edge..."}
        </p>
      </main>
    );
  }

  if (screen === "order" && activeTable && operator && menu) {
    const channel = getChannel();
    const total = cartTotal(cart);
    const variantGroups = variantProduct
      ? variantGroupsForProduct(variantProduct, menu.variantGroups ?? [])
      : [];
    const basePrice = variantProduct
      ? resolvePrice(variantProduct, channel, menu.prices ?? [])
      : 0;

    return (
      <main className="flex min-h-screen flex-col">
        {isOffline && (
          <div className="bg-yellow-500 px-4 py-2 text-center text-sm font-medium text-black">
            Offline — bozza salvata localmente. SPEDITO disabilitato.
          </div>
        )}

        <header className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] p-4">
          <Button variant="ghost" onClick={leaveOrder}>← Mappa</Button>
          <div className="text-center">
            <h1 className="text-lg font-bold">{activeTable.label}</h1>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {activeTable.guests ?? activeTable.defaultGuests} coperti
            </p>
          </div>
          <span className="text-sm">{operator.firstName}</span>
        </header>

        {exitConfirm && (
          <div className="border-b border-yellow-500 bg-yellow-500/10 px-4 py-2 text-sm">
            Uscire senza SPEDITO? La bozza verrà salvata.
            <Button className="ml-2 h-9 min-h-9 px-3 text-xs" onClick={leaveOrder}>Conferma</Button>
            <Button className="h-9 min-h-9 px-3 text-xs" variant="ghost" onClick={() => setExitConfirm(false)}>Annulla</Button>
          </div>
        )}

        {message && (
          <p className="border-b border-[hsl(var(--pg-border))] px-4 py-2 text-sm">{message}</p>
        )}

        <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--pg-border))] p-2">
          <input
            type="search"
            placeholder="Cerca piatto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[140px] flex-1 rounded-lg border border-[hsl(var(--pg-border))] px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {EU_ALLERGENS.slice(0, 6).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  setAllergenFilter((prev) =>
                    prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id],
                  )
                }
                className={`rounded px-2 py-1 text-xs ${
                  allergenFilter.includes(a.id) ? "bg-red-500 text-white" : "bg-[hsl(var(--pg-muted))]"
                }`}
              >
                −{a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-36 overflow-y-auto border-r border-[hsl(var(--pg-border))] p-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.id)}
                className={`mb-1 w-full rounded-lg px-2 py-3 text-left text-sm ${
                  selectedCat === c.id
                    ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                    : "bg-[hsl(var(--pg-muted))]"
                }`}
              >
                {localized(c.name)}
                {c.hold && " ⏸"}
                {c.dessert && " 🍰"}
              </button>
            ))}
          </aside>

          <section className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 content-start sm:grid-cols-3">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="min-h-[72px] rounded-lg border border-[hsl(var(--pg-border))] p-3 text-left active:scale-95"
              >
                <p className="font-medium">{localized(p.name)}</p>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  € {resolvePrice(p, channel, menu.prices ?? []).toFixed(2)}
                </p>
              </button>
            ))}
          </section>

          <aside className="flex w-52 flex-col border-l border-[hsl(var(--pg-border))] p-3">
            <h2 className="mb-2 font-semibold">Carrello</h2>
            <ul className="flex-1 space-y-2 overflow-y-auto text-sm">
              {cart.map((l) => (
                <li key={l.lineId} className="rounded border border-[hsl(var(--pg-border))] p-2">
                  <div className="flex justify-between">
                    <span>{l.quantity}× {l.name}</span>
                    <button type="button" className="text-red-500" onClick={() => setCart((prev) => prev.filter((x) => x.lineId !== l.lineId))}>✕</button>
                  </div>
                  {l.variants.length > 0 && (
                    <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {l.variants.map((v) => (v.type === "REMOVE" ? `NO ${v.name}` : v.name)).join(", ")}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[1, 2, 3, 4].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCart((prev) => prev.map((x) => x.lineId === l.lineId ? { ...x, course: c } : x))}
                        className={`rounded px-1.5 text-xs ${l.course === c ? "bg-[hsl(var(--pg-primary))] text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                      >
                        P{c}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.map((x) => x.lineId === l.lineId ? { ...x, hold: !x.hold } : x))}
                      className={`rounded px-1.5 text-xs ${l.hold ? "bg-orange-500 text-white" : "bg-[hsl(var(--pg-muted))]"}`}
                    >
                      HOLD
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDiscountLine(l.lineId);
                        setCart((prev) => prev.map((x) => x.lineId === l.lineId ? { ...x, discountPercent: settings.maxDiscountPercent } : x));
                        setPinModal("discount");
                      }}
                      className="rounded bg-[hsl(var(--pg-muted))] px-1.5 text-xs"
                    >
                      %
                    </button>
                  </div>
                  {l.discountPercent ? (
                    <p className="text-xs text-green-600">−{l.discountPercent}%</p>
                  ) : null}
                  {l.hold && <p className="text-xs text-orange-600">In attesa</p>}
                  {l.dessertDefer && <p className="text-xs text-pink-600">Dolce differito</p>}
                </li>
              ))}
            </ul>

            {submittedLines.length > 0 && (
              <div className="mb-2 border-t border-[hsl(var(--pg-border))] pt-2">
                <p className="mb-1 text-xs font-semibold">Già inviati</p>
                {submittedLines.map((l) => {
                  const remaining = l.quantity - (l.voidedQuantity ?? 0);
                  if (remaining <= 0) return null;
                  return (
                    <button
                      key={l.lineId}
                      type="button"
                      className="mb-1 block w-full rounded bg-red-500/10 px-2 py-1 text-left text-xs text-red-700"
                      onClick={() => {
                        setPendingStorno(l);
                        setPinModal("storno");
                      }}
                    >
                      Storno: {l.name} ({remaining})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mb-2 flex flex-wrap gap-1">
              {[1, 2, 3, 4].map((c) => (
                <Button key={c} className="h-9 min-h-9 px-2 text-xs" variant="outline" onClick={() => void callCourse(c)}>
                  P{c}
                </Button>
              ))}
              <Button className="h-9 min-h-9 px-2 text-xs" variant="outline" onClick={() => void releaseDessert()}>
                X DOLCE
              </Button>
            </div>

            <p className="mb-3 text-lg font-bold">€ {total.toFixed(2)}</p>
            <Button
              size="lg"
              className="mb-2 w-full"
              disabled={cart.length === 0 || isOffline}
              onClick={() => void submitOrder()}
            >
              {isOffline ? "OFFLINE" : "SPEDITO"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              disabled={isOffline || (submittedLines.length === 0 && cart.length === 0)}
              onClick={requestPayment}
            >
              RICHIEDI PAGAMENTO
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

        {pinModal === "unlock" && (
          <PinModal
            title="PIN manager per sblocco tavolo"
            onComplete={handleUnlockPin}
            onCancel={() => { setPinModal(null); setPendingUnlockTable(null); }}
            error={pinModalError}
          />
        )}
        {pinModal === "discount" && (
          <PinModal
            title="PIN manager per sconto"
            onComplete={(v) => void applyDiscount(v)}
            onCancel={() => { setPinModal(null); setPendingDiscountLine(null); }}
            error={pinModalError}
          />
        )}
        {pinModal === "storno" && (
          <PinModal
            title="PIN manager per storno"
            onComplete={(v) => void executeStorno(v)}
            onCancel={() => { setPinModal(null); setPendingStorno(null); }}
            error={pinModalError}
          />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mappa sala</h1>
          {operator && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              {operator.firstName} {operator.lastName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs ${!isOffline ? "bg-green-500/20 text-green-600" : "bg-yellow-500/20"}`}>
            {!isOffline ? "Online" : "Offline"}
          </span>
          <Button variant="outline" onClick={logout}>Esci</Button>
        </div>
      </header>

      {message && (
        <p className="mb-3 rounded bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
      )}

      <div className="relative mx-auto h-[480px] max-w-3xl rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20">
        {tables.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={lockPending === t.id}
            onClick={() => selectTable(t)}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: t.width,
              height: t.height,
            }}
            className={`flex flex-col items-center justify-center rounded-lg text-white shadow-md transition active:scale-95 ${STATUS_COLORS[t.status] ?? "bg-gray-400"} ${lockPending === t.id ? "opacity-50" : ""}`}
          >
            <span className="text-lg font-bold">{t.label}</span>
            {(t.guests ?? (!t.isVirtual ? t.defaultGuests : undefined)) && (
              <span className="text-[10px]">
                {t.guests ?? t.defaultGuests} coperti
              </span>
            )}
            {t.lockedByName && t.status === "LOCKED" && (
              <span className="text-[10px]">{t.lockedByName}</span>
            )}
          </button>
        ))}
        {tables.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun tavolo — configura la sala su Main Station
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${color.split(" ")[0]}`} />
            {status}
          </span>
        ))}
      </div>

      {pendingGuestsTable && (
        <GuestsModal
          tableLabel={pendingGuestsTable.label}
          guests={guestCount}
          onChange={setGuestCount}
          onConfirm={confirmGuests}
          onCancel={() => {
            setPendingGuestsTable(null);
            setUnlockOverridePin(undefined);
          }}
        />
      )}
    </main>
  );
}
