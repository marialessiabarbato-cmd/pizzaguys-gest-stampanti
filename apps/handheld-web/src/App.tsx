import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "./components/ConfirmModal";
import { PinPad } from "./components/PinPad";
import { PinModal } from "./components/PinModal";
import { edgeApi } from "./lib/api";
import {
  buildCartLine,
  lineKey,
  variantsForProduct,
} from "./lib/menu";
import { normalizeCourse, stepLabel, suggestedCourseForCategory } from "./lib/course";
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
  WorkspaceTab,
} from "./lib/types";
import { useEdgeWs } from "./lib/ws";
import { MapScreen } from "./screens/MapScreen";
import { TableWorkspace } from "./screens/TableWorkspace";
import { VariantSheet } from "./components/VariantSheet";

type PinModalMode = "unlock" | "discount" | null;

export default function App() {
  const { connected, send, on } = useEdgeWs();
  const [online, setOnline] = useState(navigator.onLine);
  const [screen, setScreen] = useState<Screen>("pin");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("comanda");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedSubmittedId, setSelectedSubmittedId] = useState<string | null>(null);
  const pendingAfterLockRef = useRef<(() => void) | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [activeTable, setActiveTable] = useState<LiveTable | null>(null);
  const activeTableRef = useRef(activeTable);
  activeTableRef.current = activeTable;
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submittedLines, setSubmittedLines] = useState<SubmittedLine[]>([]);
  const [message, setMessage] = useState("");
  const [lockPending, setLockPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [allergenFilter, setAllergenFilter] = useState<string[]>([]);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editCartLine, setEditCartLine] = useState<CartLine | null>(null);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<PinModalMode>(null);
  const [pinModalError, setPinModalError] = useState("");
  const [pendingUnlockTable, setPendingUnlockTable] = useState<LiveTable | null>(null);
  const [pendingGuestsTable, setPendingGuestsTable] = useState<LiveTable | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [unlockOverridePin, setUnlockOverridePin] = useState<string | undefined>();
  const [pendingDiscountLine, setPendingDiscountLine] = useState<string | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [confirmCallCourse, setConfirmCallCourse] = useState<number | null>(null);
  const [confirmReleaseDessert, setConfirmReleaseDessert] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmStorno, setConfirmStorno] = useState<SubmittedLine | null>(null);
  const [pendingNoteSave, setPendingNoteSave] = useState<{
    lineId: string;
    note: string;
    lineName: string;
  } | null>(null);
  const [pendingVariantSave, setPendingVariantSave] = useState<VariantSelection[] | null>(null);
  const [confirmDiscountLine, setConfirmDiscountLine] = useState<string | null>(null);
  const cartDirty = useRef(false);

  const isOffline = !connected || !online;
  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];
  const settings = menu?.settings ?? { maxDiscountPercent: 20, tableLockTimeoutMinutes: 15 };
  const hasLock =
    !!operator &&
    !!activeTable &&
    activeTable.lockedBy === operator.id &&
    (activeTable.status === "LOCKED" || activeTable.status === "OCCUPIED");

  const openWorkspace = async (
    table: LiveTable,
    tab: WorkspaceTab = "comanda",
    options?: { resetNavigation?: boolean },
  ) => {
    setActiveTable(table);
    await loadDraftForTable(table.id);
    loadMenu({ resetNavigation: options?.resetNavigation ?? false });
    setWorkspaceTab(tab);
    setActiveCourse(1);
    setSelectedLineId(null);
    setSelectedSubmittedId(null);
    setScreen("table");
  };

  const ensureLock = (action: () => void) => {
    if (!operator || !activeTable) return;
    if (hasLock) {
      action();
      return;
    }
    pendingAfterLockRef.current = action;
    requestLock(activeTable);
  };

  const loadTables = useCallback(() => {
    void edgeApi<LiveTable[]>("/api/tables/live").then(setTables);
  }, []);

  const loadMenu = useCallback((options?: { resetNavigation?: boolean }) => {
    void edgeApi<{ snapshot: MenuSnapshot }>("/api/menu").then((m) => {
      const snap = m.snapshot;
      const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setMenu({ ...snap, categories: cats });
      if (options?.resetNavigation && cats[0]) {
        setSelectedCat(cats[0].id);
        setActiveCourse(suggestedCourseForCategory(cats[0]));
      }
    });
  }, []);

  const loadDraftForTable = useCallback(
    async (tableId: string) => {
      if (isOffline) {
        const local = await loadDraft(tableId);
        const lines = local?.cart ?? [];
        setCart(lines);
        setSubmittedLines([]);
        return { cart: lines, submitted: [] as SubmittedLine[] };
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
          notes?: string;
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
      const cartLines: CartLine[] = data.draft?.lines
        ? data.draft.lines.map((l) => ({
            lineId: l.id,
            productId: l.productId,
            name: l.name,
            basePrice: l.basePrice ?? l.unitPrice,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            variants: l.variants ?? [],
            course: normalizeCourse(l.course ?? 1),
            hold: l.hold ?? false,
            dessertDefer: l.dessertDefer ?? false,
            notes: l.notes,
            discountPercent: l.discountPercent,
            discountToken: l.discountToken,
            allergenIds: [],
          }))
        : [];
      setCart(cartLines);
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
      return { cart: cartLines, submitted };
    },
    [isOffline],
  );

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
      const table =
        tables.find((t) => t.id === p.tableId) ??
        (activeTableRef.current?.id === p.tableId ? activeTableRef.current : null);
      if (table && operator) {
        setActiveTable({ ...table, status: "LOCKED", guests: p.guests ?? table.guests });
        const run = pendingAfterLockRef.current;
        pendingAfterLockRef.current = null;
        if (run) {
          void loadDraftForTable(p.tableId).then(() => run());
        } else {
          void loadDraftForTable(p.tableId);
          loadMenu({ resetNavigation: true });
          setWorkspaceTab("menu");
        }
        setScreen("table");
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
        setActiveTable(null);
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
  }, [on, loadTables, tables, operator, loadMenu, loadDraftForTable]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if ((screen === "table") && cart.length > 0) {
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

  const reenterTable = async (table: LiveTable) => {
    const data = await loadDraftForTable(table.id);
    const tab: WorkspaceTab =
      data.cart.length > 0 ? "comanda" : data.submitted.length > 0 ? "comanda" : "menu";
    await openWorkspace({ ...table, status: "LOCKED" }, tab);
  };

  const selectTable = (table: LiveTable) => {
    if (!operator) return;
    setMessage("");
    if (table.status === "LOCKED" && table.lockedBy === operator.id) {
      void reenterTable(table);
      return;
    }
    if (table.status === "LOCKED" && table.lockedBy !== operator.id) {
      setPendingUnlockTable(table);
      setPinModal("unlock");
      return;
    }
    if (
      !table.isVirtual &&
      (table.status === "OCCUPIED" ||
        table.status === "BILL_REQUESTED" ||
        table.status === "SPLIT_IN_PROGRESS")
    ) {
      void openWorkspace(table, "comanda");
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

  const findCategory = (categoryId: string) =>
    categories.find((c) => c.id === categoryId) ?? {
      id: categoryId,
      name: { it: "" },
      colorHex: "#888888",
      sortOrder: 0,
    };

  const mergeCartLine = (line: CartLine) => {
    const key = lineKey(line.productId, line.variants, line.course);
    let focusId = line.lineId;
    setCart((prev) => {
      const existing = prev.find(
        (l) => lineKey(l.productId, l.variants, l.course) === key,
      );
      if (existing) {
        focusId = existing.lineId;
        return prev.map((l) =>
          lineKey(l.productId, l.variants, l.course) === key
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      const courseHold = prev.some((l) => l.course === line.course && l.hold);
      return [...prev, courseHold ? { ...line, hold: true } : line];
    });
    setSelectedLineId(focusId);
  };

  const handleSelectCat = (catId: string) => {
    setSelectedCat(catId);
    const cat = categories.find((c) => c.id === catId);
    if (cat) setActiveCourse(suggestedCourseForCategory(cat));
  };

  const addProduct = (product: Product) => {
    if (!menu) return;
    const doAdd = () => {
      const options = variantsForProduct(product, menu.variantGroups ?? []);
      const channel = getChannel();
      if (options.length > 0) {
        setVariantProduct(product);
        return;
      }
      const category = findCategory(product.categoryId);
      const line = buildCartLine(
        product,
        category,
        channel,
        menu.prices ?? [],
        [],
        activeCourse,
      );
      if ("error" in line) {
        setMessage(line.error);
        return;
      }
      mergeCartLine(line);
    };
    ensureLock(doAdd);
  };

  const confirmVariants = (variants: VariantSelection[]) => {
    if (!variantProduct || !menu) return;
    const category = findCategory(variantProduct.categoryId);
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

  const mapLinePayload = (l: CartLine) => ({
    id: l.lineId,
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    basePrice: l.basePrice,
    channel: getChannel(),
    notes: l.notes || undefined,
    variants: l.variants,
    course: normalizeCourse(l.course),
    hold: l.hold,
    dessertDefer: l.dessertDefer,
    discountPercent: l.discountPercent,
    discountToken: l.discountToken,
  });

  const persistDraft = async () => {
    if (!operator || !activeTable || cart.length === 0) return;
    await edgeApi("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: activeTable.id,
        operatorId: operator.id,
        operatorName: `${operator.firstName} ${operator.lastName}`,
        channel: getChannel(),
        lines: cart.map(mapLinePayload),
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
    const guests = activeTable.guests ?? activeTable.defaultGuests ?? 0;
    if (!activeTable.isVirtual && guests <= 0) {
      setMessage("Imposta i coperti prima di SPEDITO");
      return;
    }
    const invalid = cart.find((l) => l.unitPrice <= 0);
    if (invalid) {
      setMessage(`Prezzo non valido: ${invalid.name}`);
      return;
    }

    await persistDraft();
    const order = await edgeApi<{ id: string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: activeTable.id,
        operatorId: operator.id,
        operatorName: `${operator.firstName} ${operator.lastName}`,
        channel: getChannel(),
        lines: cart.map(mapLinePayload),
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
      const tableId = activeTable.id;
      setCart([]);
      cartDirty.current = false;
      await loadDraftForTable(tableId);
      const refreshed = tables.find((t) => t.id === tableId);
      if (refreshed) {
        setActiveTable({ ...refreshed, status: "OCCUPIED" });
        setWorkspaceTab("comanda");
        setScreen("table");
      } else {
        setActiveTable(null);
        setScreen("map");
      }
      loadTables();
    }
  };

  const callCourse = async (course: number) => {
    if (!activeTable || isOffline) return;
    await edgeApi("/api/orders/call-course", {
      method: "POST",
      body: JSON.stringify({ tableId: activeTable.id, course }),
    });
    setConfirmCallCourse(null);
    setMessage(`Marcia — ${stepLabel(course)} inviata in cucina`);
  };

  const releaseDessert = async () => {
    if (!activeTable || isOffline) return;
    await edgeApi("/api/orders/release-dessert", {
      method: "POST",
      body: JSON.stringify({ tableId: activeTable.id }),
    });
    setConfirmReleaseDessert(false);
    setMessage("X DOLCE — dolci inviati in cucina");
  };

  const requestPayment = () => {
    if (!operator || !activeTable || isOffline) return;
    send("REQUEST_PAYMENT", {
      tableId: activeTable.id,
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
    });
    setConfirmPayment(false);
    setMessage("Pagamento richiesto — cassa notificata");
    loadTables();
  };

  const applyDiscount = async (pin: string) => {
    if (!pendingDiscountLine) return;
    setPinModalError("");
    try {
      const line = cart.find((l) => l.lineId === pendingDiscountLine);
      if (!line) return;
      const percent = settings.maxDiscountPercent;
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

  const executeStorno = async (line: SubmittedLine) => {
    if (!operator) return;
    try {
      await edgeApi(`/api/orders/${line.orderId}/storno`, {
        method: "POST",
        body: JSON.stringify({
          lineId: line.lineId,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
        }),
      });
      setSubmittedLines((prev) =>
        prev.map((l) =>
          l.lineId === line.lineId ? { ...l, voidedQuantity: (l.voidedQuantity ?? 0) + 1 } : l,
        ),
      );
      setConfirmStorno(null);
      setSelectedSubmittedId(null);
      setMessage("Storno inviato — ticket ANNULLO stampato");
    } catch {
      setMessage("Storno non riuscito — riprova");
    }
  };

  const releaseLockIfHeld = () => {
    if (operator && activeTable?.status === "LOCKED") {
      send("RELEASE_TABLE_LOCK", { tableId: activeTable.id, operatorId: operator.id });
    }
  };

  const leaveTable = () => {
    if (cart.length > 0 && !exitConfirm) {
      setExitConfirm(true);
      return;
    }
    if (operator && activeTable && cart.length > 0) {
      void persistDraft();
    }
    setExitConfirm(false);
    releaseLockIfHeld();
    setScreen("map");
    setActiveTable(null);
    setSelectedLineId(null);
    setSelectedSubmittedId(null);
  };

  const handleEditLine = (line: CartLine) => {
    if (!menu) return;
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    const options = variantsForProduct(product, menu.variantGroups ?? []);
    if (options.length > 0) {
      setEditCartLine(line);
    } else {
      setNoteLineId(line.lineId);
    }
  };

  const stageVariantSave = (variants: VariantSelection[]) => {
    if (!editCartLine) return;
    const unitPrice = calculateLinePrice(
      editCartLine.basePrice,
      variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
    );
    if (unitPrice <= 0) {
      setMessage("Prezzo riga non valido (vincolo fiscale)");
      return;
    }
    setPendingVariantSave(variants);
  };

  const applyVariantSave = () => {
    if (!editCartLine || !pendingVariantSave) return;
    const unitPrice = calculateLinePrice(
      editCartLine.basePrice,
      pendingVariantSave.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
    );
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === editCartLine.lineId
          ? { ...l, variants: pendingVariantSave, unitPrice }
          : l,
      ),
    );
    setPendingVariantSave(null);
    setEditCartLine(null);
  };

  const applyNoteSave = () => {
    if (!pendingNoteSave) return;
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === pendingNoteSave.lineId
          ? { ...l, notes: pendingNoteSave.note || undefined }
          : l,
      ),
    );
    setPendingNoteSave(null);
    setNoteLineId(null);
  };

  const logout = () => {
    setOperator(null);
    setScreen("pin");
    setActiveTable(null);
    setCart([]);
  };

  const modals = (
    <>
      {exitConfirm && (
        <ConfirmModal
          title="Attenzione!"
          message="Ci sono comande non spedite. Se esci dal tavolo senza spedire, la bozza resta salvata ma il tavolo verrà sbloccato."
          confirmLabel="Esci"
          cancelLabel="Continua ordine"
          onConfirm={leaveTable}
          onCancel={() => setExitConfirm(false)}
        />
      )}
      {submitConfirm && (
        <ConfirmModal
          title="Inviare in cucina?"
          message={`Confermi SPEDITO per ${cart.length} righe?`}
          confirmLabel="SPEDITO"
          onConfirm={() => {
            setSubmitConfirm(false);
            void submitOrder();
          }}
          onCancel={() => setSubmitConfirm(false)}
        />
      )}
      {confirmCallCourse != null && (
        <ConfirmModal
          title={`Chiamare ${stepLabel(confirmCallCourse)}?`}
          message="Verrà inviato un sollecito in cucina e sbloccati i piatti in HOLD."
          confirmLabel="Marcia"
          onConfirm={() => void callCourse(confirmCallCourse)}
          onCancel={() => setConfirmCallCourse(null)}
        />
      )}
      {confirmReleaseDessert && (
        <ConfirmModal
          title="Inviare i dolci?"
          message="I dessert differiti verranno stampati in cucina."
          confirmLabel="X DOLCE"
          onConfirm={() => void releaseDessert()}
          onCancel={() => setConfirmReleaseDessert(false)}
        />
      )}
      {confirmPayment && (
        <ConfirmModal
          title="Richiedere preconto?"
          message="La cassa riceverà una notifica per stampare il preconto."
          confirmLabel="Preconto"
          onConfirm={requestPayment}
          onCancel={() => setConfirmPayment(false)}
        />
      )}
      {confirmStorno && (
        <ConfirmModal
          title="Stornare la riga?"
          message={`Annullare ${confirmStorno.name}? Verrà stampato il ticket ANNULLO in cucina.`}
          confirmLabel="Annulla piatto"
          variant="danger"
          onConfirm={() => void executeStorno(confirmStorno)}
          onCancel={() => setConfirmStorno(null)}
        />
      )}
      {pendingNoteSave && (
        <ConfirmModal
          title="Salvare la nota?"
          message={
            pendingNoteSave.note
              ? `Aggiungere la nota «${pendingNoteSave.note}» a ${pendingNoteSave.lineName}?`
              : `Rimuovere la nota da ${pendingNoteSave.lineName}?`
          }
          confirmLabel="Salva"
          onConfirm={applyNoteSave}
          onCancel={() => setPendingNoteSave(null)}
        />
      )}
      {pendingVariantSave && editCartLine && (
        <ConfirmModal
          title="Salvare le modifiche?"
          message={`Confermi le varianti su «${editCartLine.name}»?`}
          confirmLabel="Salva"
          onConfirm={applyVariantSave}
          onCancel={() => setPendingVariantSave(null)}
        />
      )}
      {confirmDiscountLine && (
        <ConfirmModal
          title="Applicare sconto?"
          message={`Richiedere sconto sulla riga «${
            cart.find((l) => l.lineId === confirmDiscountLine)?.name ?? ""
          }»? Serve PIN manager.`}
          confirmLabel="Continua"
          onConfirm={() => {
            const lineId = confirmDiscountLine;
            setConfirmDiscountLine(null);
            setPendingDiscountLine(lineId);
            setCart((prev) =>
              prev.map((x) =>
                x.lineId === lineId ? { ...x, discountPercent: settings.maxDiscountPercent } : x,
              ),
            );
            setPinModal("discount");
          }}
          onCancel={() => setConfirmDiscountLine(null)}
        />
      )}
      {pinModal === "unlock" && (
        <PinModal
          title="PIN manager per sblocco tavolo"
          onComplete={handleUnlockPin}
          onCancel={() => {
            setPinModal(null);
            setPendingUnlockTable(null);
          }}
          error={pinModalError}
        />
      )}
      {pinModal === "discount" && (
        <PinModal
          title="PIN manager per sconto"
          onComplete={(v) => void applyDiscount(v)}
          onCancel={() => {
            setPinModal(null);
            setPendingDiscountLine(null);
          }}
          error={pinModalError}
        />
      )}
    </>
  );

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

  if (screen === "table" && activeTable && operator && menu) {
    const channel = getChannel();
    const editProduct = editCartLine
      ? products.find((p) => p.id === editCartLine.productId) ?? null
      : null;

    return (
      <>
        <TableWorkspace
          table={activeTable}
          operator={operator}
          menu={menu}
          categories={categories}
          cart={cart}
          submittedLines={submittedLines}
          workspaceTab={workspaceTab}
          selectedLineId={selectedLineId}
          selectedSubmittedId={selectedSubmittedId}
          search={search}
          allergenFilter={allergenFilter}
          selectedCat={selectedCat}
          variantProduct={variantProduct}
          isOffline={isOffline}
          hasLock={hasLock}
          message={message}
          channel={channel}
          activeCourse={activeCourse}
          onActiveCourseChange={setActiveCourse}
          onTabChange={setWorkspaceTab}
          onSelectLine={setSelectedLineId}
          onSelectSubmitted={setSelectedSubmittedId}
          onSearchChange={setSearch}
          onAllergenToggle={(id) =>
            setAllergenFilter((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          onSelectCat={handleSelectCat}
          onAddProduct={addProduct}
          onConfirmVariants={confirmVariants}
          onCancelVariants={() => setVariantProduct(null)}
          onUpdateCart={setCart}
          onLeaveTable={leaveTable}
          onSpedisci={() => ensureLock(() => setSubmitConfirm(true))}
          onMarcia={(c) => setConfirmCallCourse(c)}
          onPreconto={() => setConfirmPayment(true)}
          onReleaseDessert={() => setConfirmReleaseDessert(true)}
          onDiscountLine={(lineId) => setConfirmDiscountLine(lineId)}
          onStorno={(l) => setConfirmStorno(l)}
          onEditLine={handleEditLine}
          noteLineId={noteLineId}
          onSaveNote={(lineId, note) => {
            const line = cart.find((l) => l.lineId === lineId);
            if (!line) return;
            setPendingNoteSave({ lineId, note, lineName: line.name });
          }}
          onCancelNote={() => setNoteLineId(null)}
          onAcquireLock={() => activeTable && ensureLock(() => setMessage("Tavolo acquisito"))}
        />
        {editProduct && editCartLine && (
          <VariantSheet
            product={editProduct}
            variants={variantsForProduct(editProduct, menu.variantGroups ?? [])}
            basePrice={editCartLine.basePrice}
            initialVariants={editCartLine.variants}
            confirmLabel="Salva"
            onConfirm={stageVariantSave}
            onCancel={() => setEditCartLine(null)}
          />
        )}
        {modals}
      </>
    );
  }

  if (screen === "map" && operator) {
    return (
      <>
        <MapScreen
          operator={operator}
          tables={tables}
          message={message}
          isOffline={isOffline}
          lockPending={lockPending}
          logoutConfirm={logoutConfirm}
          pendingGuestsTable={pendingGuestsTable}
          guestCount={guestCount}
          onSelectTable={selectTable}
          onLogout={() => setLogoutConfirm(true)}
          onConfirmLogout={() => {
            setLogoutConfirm(false);
            logout();
          }}
          onCancelLogout={() => setLogoutConfirm(false)}
          onGuestsChange={setGuestCount}
          onConfirmGuests={confirmGuests}
          onCancelGuests={() => {
            setPendingGuestsTable(null);
            setUnlockOverridePin(undefined);
          }}
        />
        {modals}
      </>
    );
  }

  return null;
}
