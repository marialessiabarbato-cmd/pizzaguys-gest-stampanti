import { calculateLinePrice } from "@pizzaguys/fiscal";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuestsModal, type GuestsConfirmPayload } from "./components/GuestsModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { PinPad } from "./components/PinPad";
import { PinModal } from "./components/PinModal";
import { PriceOverrideModal } from "./components/PriceOverrideModal";
import { StornoQtyModal } from "./components/StornoQtyModal";
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
import { CounterOrdersScreen } from "./screens/CounterOrdersScreen";
import { MapScreen } from "./screens/MapScreen";
import { TableWorkspace } from "./screens/TableWorkspace";
import { VariantSheet } from "./components/VariantSheet";
import { TableTransferModal } from "./components/TableTransferModal";

type PinModalMode = "unlock" | "discount" | "guests-lock" | null;

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
  const [guestsModalLoading, setGuestsModalLoading] = useState(false);
  const [guestsModalError, setGuestsModalError] = useState("");
  const [pendingGuestsAction, setPendingGuestsAction] = useState<{
    table: LiveTable;
    payload: GuestsConfirmPayload;
    mode: "open" | "edit";
  } | null>(null);
  const [unlockOverridePin, setUnlockOverridePin] = useState<string | undefined>();
  const [pendingDiscountLine, setPendingDiscountLine] = useState<string | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [confirmCallCourse, setConfirmCallCourse] = useState<number | null>(null);
  const [confirmReleaseDessert, setConfirmReleaseDessert] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmStorno, setConfirmStorno] = useState<SubmittedLine | null>(null);
  const [stornoQtyTarget, setStornoQtyTarget] = useState<{
    line: SubmittedLine;
    maxQty: number;
  } | null>(null);
  const [priceOverrideTarget, setPriceOverrideTarget] = useState<{
    kind: "cart" | "submitted";
    lineId: string;
    name: string;
    unitPrice: number;
  } | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEditGuestsModal, setShowEditGuestsModal] = useState(false);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
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
    await loadMenu({ resetNavigation: options?.resetNavigation ?? false });
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
    void edgeApi<Array<{ id: string; name: string }>>("/api/rooms").then(setRooms);
  }, []);

  const loadMenu = useCallback(async (options?: { resetNavigation?: boolean }) => {
    const m = await edgeApi<{ snapshot: MenuSnapshot }>("/api/menu");
    const snap = m.snapshot;
    const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    setMenu({ ...snap, categories: cats });
    if (options?.resetNavigation && cats[0]) {
      setSelectedCat(cats[0].id);
      setActiveCourse(suggestedCourseForCategory(cats[0]));
    }
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
            unitPrice: number;
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
            unitPrice: line.unitPrice,
            voidedQuantity: line.voidedQuantity,
          });
        }
      }
      setSubmittedLines(submitted);
      return { cart: cartLines, submitted };
    },
    [isOffline],
  );

  const applyLockGranted = useCallback(
    async (table: LiveTable, guests?: number) => {
      if (!operator) return;
      setActiveTable({
        ...table,
        status: "LOCKED",
        lockedBy: operator.id,
        guests: guests ?? table.guests,
      });
      const run = pendingAfterLockRef.current;
      pendingAfterLockRef.current = null;
      if (run) {
        await loadDraftForTable(table.id);
        run();
      } else {
        await loadDraftForTable(table.id);
        await loadMenu({ resetNavigation: true });
        setWorkspaceTab("menu");
        setScreen("table");
      }
      setLockPending(null);
      setPendingUnlockTable(null);
      setPendingGuestsTable(null);
      setUnlockOverridePin(undefined);
    },
    [operator, loadDraftForTable, loadMenu],
  );

  const requestLock = useCallback(
    async (table: LiveTable, overridePin?: string, guests?: number) => {
      if (!operator) return;
      setLockPending(table.id);
      try {
        const lock = await edgeApi<{
          guests?: number;
          lockedBy?: string;
          lockedByName?: string;
          tableCapacity?: number;
          linkedTableIds?: string[];
        }>(`/api/tables/${table.id}/lock`, {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            guests: guests ?? table.guests ?? table.defaultGuests ?? 2,
          }),
        });
        await applyLockGranted(
          {
            ...table,
            lockedBy: lock.lockedBy ?? operator.id,
            lockedByName: lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
            tableCapacity: lock.tableCapacity ?? table.tableCapacity,
            linkedTableIds: lock.linkedTableIds ?? table.linkedTableIds,
          },
          lock.guests ?? guests,
        );
        loadTables();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Lock negato");
        setLockPending(null);
      }
    },
    [operator, applyLockGranted, loadTables],
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
    if (screen === "map" && operator) {
      loadTables();
      void loadMenu();
    }
  }, [screen, operator, loadTables, loadMenu]);

  useEffect(() => {
    if (pendingGuestsTable || showEditGuestsModal) loadTables();
  }, [pendingGuestsTable, showEditGuestsModal, loadTables]);

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
        void applyLockGranted(table, p.guests ?? table.guests);
      }
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
    const unsub6 = on("TABLE_ACCOUNT_MOVED", (payload) => {
      const p = payload as { sourceTableIds: string[]; targetTableId: string };
      loadTables();
      if (activeTable && p.sourceTableIds.includes(activeTable.id)) {
        void loadDraftForTable(activeTable.id).then((data) => {
          if (data.cart.length === 0 && data.submitted.length === 0) {
            setMessage("Conto spostato su altro tavolo");
            setScreen("map");
            setActiveTable(null);
            setCart([]);
            setSubmittedLines([]);
          }
        });
      } else if (activeTable?.id === p.targetTableId) {
        void loadDraftForTable(activeTable.id);
      }
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, [on, loadTables, tables, operator, loadMenu, loadDraftForTable, applyLockGranted]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (screen === "table" && cart.length > 0) {
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
      loadTables();
      void loadMenu();
    } catch {
      setPinError("PIN errato");
      setPin("");
    }
  };

  const openGuestsModal = (table: LiveTable) => {
    setGuestsModalError("");
    setPendingGuestsTable(table);
  };

  const openTableWithGuests = async (
    table: LiveTable,
    payload: GuestsConfirmPayload,
    overridePin?: string,
  ) => {
    if (!operator) return;
    setGuestsModalLoading(true);
    setGuestsModalError("");
    try {
      let target = table;
      if (payload.mergeTableIds.length > 0) {
        await edgeApi("/api/tables/merge", {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            sourceTableIds: payload.mergeTableIds,
            targetTableId: table.id,
          }),
        });
        const live = await edgeApi<LiveTable[]>("/api/tables/live");
        if (Array.isArray(live)) {
          target = live.find((t) => t.id === table.id) ?? target;
          setTables(live);
        } else {
          loadTables();
        }
      }
      setUnlockOverridePin(undefined);
      await requestLock(target, overridePin, payload.guests);
      if (payload.mergeTableIds.length > 0) {
        setMessage("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore apertura tavolo";
      if (msg.includes("bloccato") && !overridePin) {
        setPendingGuestsAction({ table, payload, mode: "open" });
        setPinModal("guests-lock");
      } else {
        setGuestsModalError(msg);
      }
    } finally {
      setGuestsModalLoading(false);
    }
  };

  const confirmGuests = (payload: GuestsConfirmPayload) => {
    if (!pendingGuestsTable) return;
    void openTableWithGuests(pendingGuestsTable, payload, unlockOverridePin);
  };

  const saveTableGuests = async (
    payload: GuestsConfirmPayload,
    overridePin?: string,
  ) => {
    if (!operator || !activeTable) return;
    setGuestsModalLoading(true);
    setGuestsModalError("");
    try {
      if (payload.mergeTableIds.length > 0) {
        await edgeApi("/api/tables/merge", {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            sourceTableIds: payload.mergeTableIds,
            targetTableId: activeTable.id,
          }),
        });
        const live = await edgeApi<LiveTable[]>("/api/tables/live");
        if (Array.isArray(live)) {
          setTables(live);
          const updated = live.find((t) => t.id === activeTable.id);
          if (updated) {
            setActiveTable(updated);
          }
        } else {
          loadTables();
        }
      }
      const row = await edgeApi<{ guests: number; tableCapacity: number }>(
        `/api/tables/${activeTable.id}/guests`,
        {
          method: "PATCH",
          body: JSON.stringify({ guests: payload.guests, operatorId: operator.id }),
        },
      );
      setActiveTable({
        ...activeTable,
        guests: row.guests,
        tableCapacity: row.tableCapacity,
      });
      setShowEditGuestsModal(false);
      setGuestsModalError("");
      setMessage(
        payload.mergeTableIds.length > 0
          ? `Tavoli uniti · ${row.guests} coperti su ${row.tableCapacity} posti`
          : `Coperti aggiornati: ${row.guests}`,
      );
      loadTables();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore aggiornamento coperti";
      if (msg.includes("bloccato") && !overridePin) {
        setPendingGuestsAction({ table: activeTable, payload, mode: "edit" });
        setPinModal("guests-lock");
      } else {
        setGuestsModalError(msg);
      }
    } finally {
      setGuestsModalLoading(false);
    }
  };

  const openEditGuests = () => {
    if (!activeTable) return;
    setGuestsModalError("");
    setShowEditGuestsModal(true);
  };

  const handleGuestsLockPin = (pin: string) => {
    if (!pendingGuestsAction) return;
    setPinModal(null);
    setPinModalError("");
    const action = pendingGuestsAction;
    setPendingGuestsAction(null);
    if (action.mode === "open") {
      void openTableWithGuests(action.table, action.payload, pin);
    } else {
      void saveTableGuests(action.payload, pin);
    }
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
    if (table.mergedIntoTableId) {
      const host = tables.find((t) => t.id === table.mergedIntoTableId);
      if (host) {
        selectTable(host);
        return;
      }
    }
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
      if (!table.lockedBy && operator) {
        pendingAfterLockRef.current = () => {
          void openWorkspace(table, "comanda");
        };
        void requestLock(table);
        return;
      }
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
      const courseHold = prev.some(
        (l) => normalizeCourse(l.course) === normalizeCourse(line.course) && l.hold,
      );
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

  const executeStorno = async (line: SubmittedLine, quantity: number) => {
    if (!operator) return;
    try {
      await edgeApi(`/api/orders/${line.orderId}/storno`, {
        method: "POST",
        body: JSON.stringify({
          lineId: line.lineId,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
          quantity,
        }),
      });
      setSubmittedLines((prev) =>
        prev.map((l) =>
          l.lineId === line.lineId
            ? { ...l, voidedQuantity: (l.voidedQuantity ?? 0) + quantity }
            : l,
        ),
      );
      setConfirmStorno(null);
      setStornoQtyTarget(null);
      setSelectedSubmittedId(null);
      setMessage(
        quantity > 1
          ? `Storno di ${quantity}× inviato — ticket ANNULLO stampato`
          : "Storno inviato — ticket ANNULLO stampato",
      );
    } catch {
      setMessage("Storno non riuscito — riprova");
    }
  };

  const requestStorno = (line: SubmittedLine) => {
    const remaining = line.quantity - (line.voidedQuantity ?? 0);
    if (remaining > 1) {
      setStornoQtyTarget({ line, maxQty: remaining });
      return;
    }
    setConfirmStorno(line);
  };

  const applyPriceOverride = async (unitPrice: number) => {
    if (!priceOverrideTarget || !operator || !activeTable) return;
    const { kind, lineId, name } = priceOverrideTarget;

    if (kind === "cart") {
      setCart((prev) =>
        prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice } : l)),
      );
    }

    try {
      await edgeApi("/api/orders/line-price", {
        method: "POST",
        body: JSON.stringify({
          tableId: activeTable.id,
          lineId,
          unitPrice,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
        }),
      });
      if (kind === "submitted") {
        setSubmittedLines((prev) =>
          prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice } : l)),
        );
      }
      setPriceOverrideTarget(null);
      setMessage(`Prezzo aggiornato: ${name} → € ${unitPrice.toFixed(2)}`);
    } catch {
      // Bozza locale: se la riga non è ancora sul server, l'update locale resta valido
      if (kind === "cart") {
        setPriceOverrideTarget(null);
        setMessage(`Prezzo aggiornato in bozza: ${name} → € ${unitPrice.toFixed(2)}`);
        return;
      }
      setMessage("Modifica prezzo non riuscita — riprova");
    }
  };

  const openPriceOverride = (target: { kind: "cart" | "submitted"; lineId: string }) => {
    if (target.kind === "cart") {
      const line = cart.find((l) => l.lineId === target.lineId);
      if (!line) return;
      setPriceOverrideTarget({
        kind: "cart",
        lineId: line.lineId,
        name: line.name,
        unitPrice: line.unitPrice,
      });
      return;
    }
    const line = submittedLines.find((l) => l.lineId === target.lineId);
    if (!line) return;
    setPriceOverrideTarget({
      kind: "submitted",
      lineId: line.lineId,
      name: line.name,
      unitPrice: line.unitPrice,
    });
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

  const handleEditVariants = (line: CartLine) => {
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

  const handleEditNote = (line: CartLine) => {
    setNoteLineId(line.lineId);
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
          onConfirm={() => void executeStorno(confirmStorno, 1)}
          onCancel={() => setConfirmStorno(null)}
        />
      )}
      {stornoQtyTarget && (
        <StornoQtyModal
          itemName={stornoQtyTarget.line.name}
          maxQty={stornoQtyTarget.maxQty}
          onConfirm={(qty) => void executeStorno(stornoQtyTarget.line, qty)}
          onCancel={() => setStornoQtyTarget(null)}
        />
      )}
      {priceOverrideTarget && (
        <PriceOverrideModal
          itemName={priceOverrideTarget.name}
          currentPrice={priceOverrideTarget.unitPrice}
          onConfirm={(price) => void applyPriceOverride(price)}
          onCancel={() => setPriceOverrideTarget(null)}
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
      {pinModal === "guests-lock" && (
        <PinModal
          title="PIN manager — tavolo bloccato"
          onComplete={handleGuestsLockPin}
          onCancel={() => {
            setPinModal(null);
            setPendingGuestsAction(null);
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

  if (screen === "table" && activeTable && operator) {
    if (!menu) {
      return (
        <>
          <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--pg-background))] p-6">
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento…</p>
          </main>
          {modals}
        </>
      );
    }

    const channel = getChannel();
    const editProduct = editCartLine
      ? products.find((p) => p.id === editCartLine.productId) ?? null
      : null;

    return (
      <>
        <TableWorkspace
          table={activeTable}
          tables={tables}
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
          onStorno={requestStorno}
          onPriceOverride={openPriceOverride}
          onEditVariants={handleEditVariants}
          onEditNote={handleEditNote}
          noteLineId={noteLineId}
          onSaveNote={(lineId, note) => {
            const line = cart.find((l) => l.lineId === lineId);
            if (!line) return;
            setPendingNoteSave({ lineId, note, lineName: line.name });
          }}
          onCancelNote={() => setNoteLineId(null)}
          onAcquireLock={() => activeTable && ensureLock(() => setMessage("Tavolo acquisito"))}
          onOpenTransfer={() => setShowTransferModal(true)}
          onEditGuests={openEditGuests}
        />
        {showEditGuestsModal && activeTable && (
          <GuestsModal
            key={activeTable.id}
            primaryTable={activeTable}
            tables={tables}
            initialGuests={activeTable.guests ?? activeTable.defaultGuests}
            confirmLabel="Salva"
            loading={guestsModalLoading}
            error={guestsModalError}
            onConfirm={(payload) => void saveTableGuests(payload)}
            onCancel={() => {
              setShowEditGuestsModal(false);
              setGuestsModalError("");
            }}
          />
        )}
        {showTransferModal && activeTable && operator && (
          <TableTransferModal
            sourceTable={activeTable}
            operator={operator}
            cart={cart}
            submittedLines={submittedLines}
            tables={tables}
            rooms={rooms}
            isOffline={isOffline}
            onRefresh={loadTables}
            onClose={() => setShowTransferModal(false)}
            onSuccess={(msg) => {
              setMessage(msg);
              setShowTransferModal(false);
              void loadDraftForTable(activeTable.id).then((data) => {
                if (data.cart.length === 0 && data.submitted.length === 0) {
                  setScreen("map");
                  setActiveTable(null);
                }
              });
              loadTables();
            }}
          />
        )}
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
          rooms={rooms}
          message={message}
          isOffline={isOffline}
          lockPending={lockPending}
          logoutConfirm={logoutConfirm}
          pendingGuestsTable={pendingGuestsTable}
          guestsModalLoading={guestsModalLoading}
          guestsModalError={guestsModalError}
          onSelectTable={selectTable}
          onOpenCounter={() => setScreen("counter")}
          onLogout={() => setLogoutConfirm(true)}
          onConfirmLogout={() => {
            setLogoutConfirm(false);
            logout();
          }}
          onCancelLogout={() => setLogoutConfirm(false)}
          onConfirmGuests={confirmGuests}
          onCancelGuests={() => {
            setPendingGuestsTable(null);
            setGuestsModalError("");
            setUnlockOverridePin(undefined);
          }}
        />
        {modals}
      </>
    );
  }

  if (screen === "counter" && operator) {
    return (
      <>
        <CounterOrdersScreen
          operator={operator}
          isOffline={isOffline}
          message={message}
          onBack={() => setScreen("map")}
          onMessage={setMessage}
          onOpenOrder={(table) => void openWorkspace(table, "comanda", { resetNavigation: true })}
        />
        {modals}
      </>
    );
  }

  return null;
}
