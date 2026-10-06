import { calculateLinePrice } from "@pizzaguys/fiscal";
import { isHeldCourse, type WsMessageType } from "@pizzaguys/types";
import { useCallback, useEffect, useState } from "react";
import { normalizeCourse, stepLabel } from "./course";
import { buildCartLine, lineKey, variantsForProduct } from "./menu";
import { formatTableLabel, resolveLiveTable } from "./table-display";
import type {
  CartLine,
  LastAddedLine,
  LiveTable,
  MenuSnapshot,
  Operator,
  Product,
  SubmittedLine,
  VariantSelection,
  WorkspaceTab,
} from "./types";

type Channel = "TABLE" | "TAKEAWAY" | "DELIVERY";

export type ComandaApi = <T>(path: string, options?: RequestInit) => Promise<T>;

/** Bozza salvata sul dispositivo (palmare offline). La cassa non la usa. */
export interface ComandaDraftStore {
  load(tableId: string): Promise<CartLine[] | null>;
  save(tableId: string, cart: CartLine[], operatorId: string): Promise<void>;
  clear(tableId: string): Promise<void>;
}

export interface UseComandaOptions {
  api: ComandaApi;
  send: (type: WsMessageType, payload: unknown) => void;
  operator: Operator | null;
  /** Tavolo aperto nella comanda. */
  table: LiveTable | null;
  /** Tutti i tavoli (servono per le unioni e i coperti del gruppo). */
  tables: LiveTable[];
  isOffline: boolean;
  setMessage: (message: string) => void;
  /** Prima di modificare la bozza: il palmare prende il tavolo, la cassa lo ha già. */
  ensureLock?: (action: () => void) => void;
  draftStore?: ComandaDraftStore;
  onPrintWarnings?: (warnings: string[]) => void;
  /** Preconto confermato: il palmare avvisa la cassa, la cassa lo stampa. */
  onPreconto: () => void | Promise<void>;
  /** Dopo uno Spedisci riuscito (aggiornare tavoli, conto, stato tavolo). */
  onSubmitted?: (info: { remainingLines: number }) => void | Promise<void>;
}

export interface PriceOverrideTarget {
  kind: "cart" | "submitted";
  lineId: string;
  name: string;
  unitPrice: number;
  basePrice?: number;
  variants?: VariantSelection[];
}

interface DraftResponse {
  draft: {
    lines: Array<{
      id: string;
      productId: string;
      name: string;
      unitPrice: number;
      basePrice?: number;
      quantity: number;
      variants?: VariantSelection[];
      course?: number;
      dessertDefer?: boolean;
      notes?: string;
      discountPercent?: number;
      discountToken?: string;
      forTableId?: string;
      forTableLabel?: string;
    }>;
  } | null;
  submitted: Array<{
    id: string;
    lines: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      basePrice?: number;
      variants?: VariantSelection[];
      voidedQuantity?: number;
      forTableId?: string;
      forTableLabel?: string;
    }>;
  }>;
}

/** Prezzo base: se manca lo ricava togliendo le aggiunte dal prezzo unitario. */
function inferBasePrice(unitPrice: number, basePrice: number | undefined, variants: VariantSelection[]) {
  if (basePrice != null && basePrice > 0) return basePrice;
  const variantSum = variants.reduce((s, v) => s + (v.priceDelta ?? 0), 0);
  const inferred = Math.round((unitPrice - variantSum) * 100) / 100;
  return inferred > 0 ? inferred : unitPrice;
}

/**
 * Stato e azioni della comanda, uguali per palmare e cassa:
 * bozza, piatti inviati, Spedisci, Marcia, X DOLCE, storno, prezzo, sconto, note e varianti.
 */
export function useComanda(options: UseComandaOptions) {
  const {
    api,
    send,
    operator,
    table,
    tables,
    isOffline,
    setMessage,
    ensureLock = (action: () => void) => action(),
    draftStore,
    onPrintWarnings,
    onPreconto,
    onSubmitted,
  } = options;

  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState(1);
  const [search, setSearch] = useState("");
  const [allergenFilter, setAllergenFilter] = useState<string[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("comanda");
  /** Tavolo fisico di destinazione quando il conto è un gruppo unito. */
  const [orderForTableId, setOrderForTableId] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [submittedLines, setSubmittedLines] = useState<SubmittedLine[]>([]);
  /** Ultimo piatto aggiunto: guida avviso, evidenziazione riga e contatore menu. */
  const [lastAdded, setLastAdded] = useState<LastAddedLine | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedSubmittedId, setSelectedSubmittedId] = useState<string | null>(null);

  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editCartLine, setEditCartLine] = useState<CartLine | null>(null);
  const [pendingVariantSave, setPendingVariantSave] = useState<VariantSelection[] | null>(null);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);

  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [confirmCallCourse, setConfirmCallCourse] = useState<number | null>(null);
  const [confirmReleaseDessert, setConfirmReleaseDessert] = useState(false);
  const [confirmPreconto, setConfirmPreconto] = useState(false);
  const [confirmStorno, setConfirmStorno] = useState<SubmittedLine | null>(null);
  const [stornoQtyTarget, setStornoQtyTarget] = useState<{ line: SubmittedLine; maxQty: number } | null>(null);
  const [priceOverrideTarget, setPriceOverrideTarget] = useState<PriceOverrideTarget | null>(null);
  const [confirmDiscountLine, setConfirmDiscountLine] = useState<string | null>(null);
  const [discountPinLineId, setDiscountPinLineId] = useState<string | null>(null);
  const [discountPinError, setDiscountPinError] = useState("");

  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];
  const settings = menu?.settings ?? { maxDiscountPercent: 20, tableLockTimeoutMinutes: 15 };
  const operatorName = operator ? `${operator.firstName} ${operator.lastName}` : "";

  const channel: Channel = !table?.isVirtual
    ? "TABLE"
    : table.virtualType === "DELIVERY"
      ? "DELIVERY"
      : "TAKEAWAY";

  const printWarnings = (warnings?: string[]) => {
    if (warnings?.length) onPrintWarnings?.(warnings);
  };

  const loadMenu = useCallback(
    async (opts?: { resetNavigation?: boolean }) => {
      const m = await api<{ snapshot: MenuSnapshot }>("/api/menu");
      const snap = m.snapshot;
      const cats = [...(snap?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setMenu({ ...snap, categories: cats });
      if (opts?.resetNavigation && cats[0]) setSelectedCat(cats[0].id);
    },
    [api],
  );

  /** Ricarica bozza e piatti inviati del tavolo dall'Edge (o dal dispositivo se offline). */
  const reload = useCallback(
    async (tableId: string) => {
      if (isOffline && draftStore) {
        const lines = (await draftStore.load(tableId)) ?? [];
        setCart(lines);
        setSubmittedLines([]);
        return { cart: lines, submitted: [] as SubmittedLine[] };
      }
      const data = await api<DraftResponse>(`/api/orders?tableId=${tableId}`);
      const cartLines: CartLine[] = (data.draft?.lines ?? []).map((l) => {
        const variants = l.variants ?? [];
        const course = normalizeCourse(l.course ?? 1);
        return {
          lineId: l.id,
          productId: l.productId,
          name: l.name,
          basePrice: inferBasePrice(l.unitPrice, l.basePrice, variants),
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          variants,
          course,
          hold: isHeldCourse(course),
          dessertDefer: l.dessertDefer ?? false,
          notes: l.notes,
          discountPercent: l.discountPercent,
          discountToken: l.discountToken,
          allergenIds: [],
          forTableId: l.forTableId,
          forTableLabel: l.forTableLabel,
        };
      });
      const submitted: SubmittedLine[] = [];
      for (const order of data.submitted ?? []) {
        for (const line of order.lines) {
          const variants = line.variants ?? [];
          submitted.push({
            orderId: order.id,
            lineId: line.id,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            basePrice: inferBasePrice(line.unitPrice, line.basePrice, variants),
            variants,
            voidedQuantity: line.voidedQuantity,
            forTableId: line.forTableId,
            forTableLabel: line.forTableLabel,
          });
        }
      }
      setCart(cartLines);
      setSubmittedLines(submitted);
      return { cart: cartLines, submitted };
    },
    [api, isOffline, draftStore],
  );

  /** Apre la comanda di un tavolo: ricarica dati e riparte da "Ora" senza selezioni. */
  const open = useCallback(
    async (tableId: string, opts?: { tab?: WorkspaceTab; resetNavigation?: boolean }) => {
      setOrderForTableId(tableId);
      setActiveCourse(1);
      setSelectedLineId(null);
      setSelectedSubmittedId(null);
      setLastAdded(null);
      setSearch("");
      const data = await reload(tableId);
      await loadMenu({ resetNavigation: opts?.resetNavigation ?? false });
      setWorkspaceTab(opts?.tab ?? "comanda");
      return data;
    },
    [reload, loadMenu],
  );

  /** Svuota lo stato quando si esce dal tavolo. */
  const reset = useCallback(() => {
    setCart([]);
    setSubmittedLines([]);
    setSelectedLineId(null);
    setSelectedSubmittedId(null);
    setLastAdded(null);
  }, []);

  // Bozza sempre salvata sul dispositivo (palmare): sopravvive a una perdita di rete.
  useEffect(() => {
    if (!draftStore || !table || cart.length === 0) return;
    void draftStore.save(table.id, cart, operator?.id ?? "");
  }, [cart, table, operator, draftStore]);

  const findCategory = (categoryId: string) =>
    categories.find((c) => c.id === categoryId) ?? {
      id: categoryId,
      name: { it: "" },
      colorHex: "#888888",
      sortOrder: 0,
    };

  const resolveOrderForTable = (): { id: string; label: string } | null => {
    if (!table) return null;
    const live = resolveLiveTable(table, tables);
    if (!live.linkedTableIds?.length) return null;
    const members = [
      live,
      ...live.linkedTableIds
        .map((id) => tables.find((t) => t.id === id))
        .filter((t): t is LiveTable => !!t),
    ];
    const selected = members.find((m) => m.id === orderForTableId) ?? members[0]!;
    return { id: selected.id, label: selected.label };
  };

  const partitionCartForSpedito = (lines: CartLine[]) => {
    const target = resolveOrderForTable();
    if (!target || !table) {
      return { target: null as { id: string; label: string } | null, toSend: lines, remaining: [] as CartLine[] };
    }
    const toSend = lines.filter((l) => (l.forTableId ?? table.id) === target.id);
    const remaining = lines.filter((l) => (l.forTableId ?? table.id) !== target.id);
    return { target, toSend, remaining };
  };

  const mergeCartLine = (line: CartLine) => {
    const key = lineKey(line.productId, line.variants, line.course, line.forTableId);
    // L'id da selezionare va calcolato prima di setCart: l'updater può girare dopo.
    const focusId =
      cart.find((l) => lineKey(l.productId, l.variants, l.course, l.forTableId) === key)?.lineId ??
      line.lineId;
    setCart((prev) => {
      const existing = prev.find((l) => lineKey(l.productId, l.variants, l.course, l.forTableId) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l.productId, l.variants, l.course, l.forTableId) === key
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, line];
    });
    setSelectedLineId(focusId);
    setSelectedSubmittedId(null);
    setLastAdded((prev) => ({
      seq: (prev?.seq ?? 0) + 1,
      lineId: focusId,
      productId: line.productId,
      name: line.name,
      course: line.course,
    }));
    navigator.vibrate?.(15);
  };

  const addProduct = (product: Product) => {
    if (!menu) return;
    ensureLock(() => {
      if (variantsForProduct(product, menu.variantGroups ?? []).length > 0) {
        setVariantProduct(product);
        return;
      }
      const line = buildCartLine(
        product,
        findCategory(product.categoryId),
        channel,
        menu.prices ?? [],
        [],
        activeCourse,
        resolveOrderForTable(),
      );
      if ("error" in line) {
        setMessage(line.error);
        return;
      }
      mergeCartLine(line);
    });
  };

  const confirmVariants = (variants: VariantSelection[]) => {
    if (!variantProduct || !menu) return;
    const line = buildCartLine(
      variantProduct,
      findCategory(variantProduct.categoryId),
      channel,
      menu.prices ?? [],
      variants,
      activeCourse,
      resolveOrderForTable(),
    );
    if ("error" in line) setMessage(line.error);
    else mergeCartLine(line);
    setVariantProduct(null);
  };

  const mapLinePayload = (l: CartLine) => ({
    id: l.lineId,
    productId: l.productId,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    basePrice: l.basePrice,
    channel,
    notes: l.notes || undefined,
    variants: l.variants,
    course: normalizeCourse(l.course),
    hold: isHeldCourse(l.course),
    dessertDefer: l.dessertDefer,
    discountPercent: l.discountPercent,
    discountToken: l.discountToken,
    forTableId: l.forTableId,
    forTableLabel: l.forTableLabel,
  });

  const saveDraftOnEdge = (lines: CartLine[]) =>
    api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        tableId: table!.id,
        operatorId: operator!.id,
        operatorName,
        channel,
        lines: lines.map(mapLinePayload),
      }),
    });

  /** Salva la bozza sull'Edge (es. uscendo dal tavolo senza spedire). */
  const persistDraft = async () => {
    if (!operator || !table || cart.length === 0) return;
    await saveDraftOnEdge(cart);
    await draftStore?.save(table.id, cart, operator.id);
  };

  const requestSubmit = () => ensureLock(() => setSubmitConfirm(true));

  const submitOrder = async () => {
    setSubmitConfirm(false);
    if (!operator || !table || cart.length === 0) return;
    if (isOffline) {
      setMessage("Offline — Spedisci disabilitato. Bozza salvata sul dispositivo.");
      await draftStore?.save(table.id, cart, operator.id);
      return;
    }
    const live = resolveLiveTable(table, tables);
    const guests =
      (live.guestTotal && live.guestTotal > 0 ? live.guestTotal : live.guests) ??
      table.defaultGuests ??
      0;
    if (!table.isVirtual && guests <= 0) {
      setMessage("Imposta i coperti prima di Spedisci");
      return;
    }

    const { target, toSend, remaining } = partitionCartForSpedito(cart);
    if (toSend.length === 0) {
      setMessage(
        target
          ? `Nessuna riga per ${formatTableLabel(target.label)} — seleziona il tavolo o aggiungi piatti`
          : "Nessuna riga da spedire",
      );
      return;
    }
    const invalid = toSend.find((l) => l.unitPrice <= 0);
    if (invalid) {
      setMessage(`Prezzo non valido: ${invalid.name}`);
      return;
    }

    try {
      const linesPayload = toSend.map((l) => {
        const base = mapLinePayload(l);
        return target && !base.forTableId ? { ...base, forTableId: target.id, forTableLabel: target.label } : base;
      });
      const order = await api<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableId: table.id,
          operatorId: operator.id,
          operatorName,
          channel,
          lines: linesPayload,
        }),
      });
      const result = await api<{
        ok: boolean;
        kdsTickets?: unknown[];
        tableLabel: string;
        printWarnings?: string[];
      }>(`/api/orders/${order.id}/submit`, { method: "POST" });
      printWarnings(result.printWarnings);
      if (!result.ok) return;

      send("ORDER_SUBMIT", {
        tableId: table.id,
        orderId: order.id,
        tableLabel: result.tableLabel,
        kdsTickets: result.kdsTickets,
      });
      const n = toSend.length;
      setMessage(
        target
          ? `Spedito ${formatTableLabel(target.label)} — ${n} ${n === 1 ? "riga" : "righe"} in cucina`
          : "Spedito — comanda inviata in cucina",
      );
      setCart(remaining);
      setSelectedLineId(null);
      if (remaining.length > 0) {
        await saveDraftOnEdge(remaining);
        await draftStore?.save(table.id, remaining, operator.id);
      } else {
        await draftStore?.clear(table.id);
      }
      await reload(table.id);
      setWorkspaceTab("comanda");
      await onSubmitted?.({ remainingLines: remaining.length });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore invio comanda");
    }
  };

  const callCourse = async (course: number) => {
    setConfirmCallCourse(null);
    if (!table || isOffline) return;
    try {
      const result = await api<{ printWarnings?: string[] }>("/api/orders/call-course", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id, course }),
      });
      printWarnings(result.printWarnings);
      setMessage(`Marcia — ${stepLabel(course)} inviata in cucina`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Marcia non riuscita");
    }
  };

  const releaseDessert = async () => {
    setConfirmReleaseDessert(false);
    if (!table || isOffline) return;
    try {
      const result = await api<{ printWarnings?: string[] }>("/api/orders/release-dessert", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id }),
      });
      printWarnings(result.printWarnings);
      setMessage("X DOLCE — dolci inviati in cucina");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invio dolci non riuscito");
    }
  };

  const preconto = async () => {
    setConfirmPreconto(false);
    if (isOffline) return;
    await onPreconto();
  };

  const requestStorno = (line: SubmittedLine) => {
    const remaining = line.quantity - (line.voidedQuantity ?? 0);
    if (remaining > 1) setStornoQtyTarget({ line, maxQty: remaining });
    else setConfirmStorno(line);
  };

  const executeStorno = async (line: SubmittedLine, quantity: number) => {
    if (!operator) return;
    try {
      const result = await api<{ printWarnings?: string[] }>(`/api/orders/${line.orderId}/storno`, {
        method: "POST",
        body: JSON.stringify({ lineId: line.lineId, operatorId: operator.id, operatorName, quantity }),
      });
      printWarnings(result.printWarnings);
      setSubmittedLines((prev) =>
        prev.map((l) =>
          l.lineId === line.lineId ? { ...l, voidedQuantity: (l.voidedQuantity ?? 0) + quantity } : l,
        ),
      );
      setSelectedSubmittedId(null);
      setMessage(
        quantity > 1
          ? `Storno di ${quantity}× inviato — ticket ANNULLO stampato`
          : "Storno inviato — ticket ANNULLO stampato",
      );
    } catch {
      setMessage("Storno non riuscito — riprova");
    } finally {
      setConfirmStorno(null);
      setStornoQtyTarget(null);
    }
  };

  const openPriceOverride = (target: { kind: "cart" | "submitted"; lineId: string }) => {
    const line =
      target.kind === "cart"
        ? cart.find((l) => l.lineId === target.lineId)
        : submittedLines.find((l) => l.lineId === target.lineId);
    if (!line) return;
    setPriceOverrideTarget({
      kind: target.kind,
      lineId: line.lineId,
      name: line.name,
      unitPrice: line.unitPrice,
      basePrice: line.basePrice,
      variants: line.variants,
    });
  };

  const applyPriceOverride = async (result: {
    unitPrice: number;
    basePrice: number;
    variants: VariantSelection[];
  }) => {
    if (!priceOverrideTarget || !operator || !table) return;
    const { kind, lineId, name } = priceOverrideTarget;
    const { unitPrice, basePrice, variants } = result;
    if (kind === "cart") {
      setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice, basePrice, variants } : l)));
    }
    try {
      await api("/api/orders/line-price", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id, lineId, unitPrice, basePrice, variants, operatorId: operator.id, operatorName }),
      });
      if (kind === "submitted") {
        setSubmittedLines((prev) =>
          prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice, basePrice, variants } : l)),
        );
      }
      setPriceOverrideTarget(null);
      setMessage(`Prezzo aggiornato: ${name} → € ${unitPrice.toFixed(2)}`);
    } catch {
      // Bozza locale: se la riga non è ancora sul server, l'aggiornamento locale resta valido.
      if (kind === "cart") {
        setPriceOverrideTarget(null);
        setMessage(`Prezzo aggiornato in bozza: ${name} → € ${unitPrice.toFixed(2)}`);
        return;
      }
      setMessage("Modifica prezzo non riuscita — riprova");
    }
  };

  /** Sconto riga: dopo la conferma serve il PIN di un responsabile. */
  const startDiscount = () => {
    const lineId = confirmDiscountLine;
    setConfirmDiscountLine(null);
    if (!lineId) return;
    setDiscountPinError("");
    setDiscountPinLineId(lineId);
  };

  const cancelDiscount = () => setDiscountPinLineId(null);

  const applyDiscount = async (pin: string) => {
    const lineId = discountPinLineId;
    if (!lineId) return;
    setDiscountPinError("");
    try {
      const auth = await api<{ token: string; percent: number }>("/api/staff/authorize-discount", {
        method: "POST",
        body: JSON.stringify({ managerPin: pin, discountPercent: settings.maxDiscountPercent }),
      });
      setCart((prev) =>
        prev.map((l) =>
          l.lineId === lineId ? { ...l, discountPercent: auth.percent, discountToken: auth.token } : l,
        ),
      );
      setDiscountPinLineId(null);
      setMessage(`Sconto ${auth.percent}% autorizzato`);
    } catch {
      setDiscountPinError("PIN non valido o sconto rifiutato");
    }
  };

  const editVariants = (line: CartLine) => {
    if (!menu) return;
    const product = products.find((p) => p.id === line.productId);
    if (!product) return;
    if (variantsForProduct(product, menu.variantGroups ?? []).length === 0) {
      setMessage("Questo prodotto non ha varianti da modificare");
      return;
    }
    setEditCartLine(line);
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
      prev.map((l) => (l.lineId === editCartLine.lineId ? { ...l, variants: pendingVariantSave, unitPrice } : l)),
    );
    setPendingVariantSave(null);
    setEditCartLine(null);
  };

  const saveNote = (lineId: string, note: string) => {
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, notes: note || undefined } : l)));
    setNoteLineId(null);
  };

  const toggleAllergen = (id: string) =>
    setAllergenFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return {
    // dati
    menu,
    categories,
    products,
    channel,
    cart,
    setCart,
    submittedLines,
    lastAdded,
    // navigazione menu
    selectedCat,
    setSelectedCat,
    activeCourse,
    setActiveCourse,
    search,
    setSearch,
    allergenFilter,
    toggleAllergen,
    workspaceTab,
    setWorkspaceTab,
    orderForTableId,
    setOrderForTableId,
    // selezione
    selectedLineId,
    setSelectedLineId,
    selectedSubmittedId,
    setSelectedSubmittedId,
    // ciclo di vita
    loadMenu,
    reload,
    open,
    reset,
    persistDraft,
    partitionCartForSpedito,
    // piatti
    addProduct,
    variantProduct,
    setVariantProduct,
    confirmVariants,
    editCartLine,
    setEditCartLine,
    editVariants,
    stageVariantSave,
    pendingVariantSave,
    setPendingVariantSave,
    applyVariantSave,
    noteLineId,
    setNoteLineId,
    saveNote,
    // invio e cucina
    submitConfirm,
    setSubmitConfirm,
    requestSubmit,
    submitOrder,
    confirmCallCourse,
    setConfirmCallCourse,
    callCourse,
    confirmReleaseDessert,
    setConfirmReleaseDessert,
    releaseDessert,
    confirmPreconto,
    setConfirmPreconto,
    preconto,
    // storno, prezzo, sconto
    confirmStorno,
    setConfirmStorno,
    stornoQtyTarget,
    setStornoQtyTarget,
    requestStorno,
    executeStorno,
    priceOverrideTarget,
    setPriceOverrideTarget,
    openPriceOverride,
    applyPriceOverride,
    confirmDiscountLine,
    setConfirmDiscountLine,
    startDiscount,
    discountPinLineId,
    discountPinError,
    cancelDiscount,
    applyDiscount,
  };
}

export type Comanda = ReturnType<typeof useComanda>;
