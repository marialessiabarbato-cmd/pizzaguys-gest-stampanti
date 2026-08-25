import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "../components/BottomSheet";
import { compactMergedTableLabel, formatTableLabel, formatUnionGuests, isUnionHost, resolveLiveTable, unionMembers, unionMemberChipLabel } from "../lib/table-display";
import { ConfirmModal } from "../components/ConfirmModal";
import { CourseOptionsModal } from "../components/CourseOptionsModal";
import { CourseStepBar } from "../components/CourseStepBar";
import { MenuPanel } from "../components/MenuPanel";
import { NoteModal } from "../components/NoteModal";
import { VariantSheet } from "../components/VariantSheet";
import {
  groupCartByCourse,
  isCourseOnHold,
  isOraCourse,
  normalizeCourse,
  stepLabel,
  suggestMarciaCourse,
} from "../lib/course";
import { cartTotal, resolvePrice, tableOrderTotal, variantsForProduct } from "../lib/menu";
import type {
  CartLine,
  Category,
  LiveTable,
  MenuSnapshot,
  Operator,
  Product,
  SubmittedLine,
  VariantSelection,
} from "../lib/types";

export type WorkspaceTab = "comanda" | "menu";

type EditConfirm =
  | { type: "delete"; line: CartLine }
  | { type: "qty"; line: CartLine; nextQty: number }
  | { type: "hold"; course: number; enable: boolean }
  | { type: "course"; lineId: string; lineName: string; course: number };

function lineTotal(l: CartLine): number {
  const d = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
  return l.unitPrice * l.quantity * d;
}

/** Totale riga + dettaglio base + aggiunte (per click → modifica prezzo). */
function linePriceParts(l: {
  unitPrice: number;
  basePrice?: number;
  quantity: number;
  variants?: CartLine["variants"];
  discountPercent?: number;
}): { total: number; detail: string | null; hasAdds: boolean } {
  const qty = Math.max(1, l.quantity);
  const discount = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
  const total = Math.round(l.unitPrice * qty * discount * 100) / 100;
  const adds = (l.variants ?? []).filter((v) => v.type === "ADD");
  if (adds.length === 0) {
    return { total, detail: null, hasAdds: false };
  }
  const addSum = adds.reduce((s, v) => s + (Number(v.priceDelta) || 0), 0);
  const inferredBase =
    l.basePrice != null && l.basePrice > 0
      ? l.basePrice
      : Math.round((l.unitPrice - addSum) * 100) / 100;
  const basePart = Math.round(inferredBase * qty * 100) / 100;
  const addParts = adds.map((v) => {
    const amount = Math.round((Number(v.priceDelta) || 0) * qty * 100) / 100;
    return `€${amount.toFixed(2)}`;
  });
  return {
    total,
    detail: `€${basePart.toFixed(2)} + ${addParts.join(" + ")}`,
    hasAdds: true,
  };
}

export function TableWorkspace({
  table,
  tables,
  operator,
  menu,
  categories,
  cart,
  submittedLines,
  workspaceTab,
  selectedLineId,
  selectedSubmittedId,
  noteLineId,
  search,
  allergenFilter,
  selectedCat,
  variantProduct,
  isOffline,
  hasLock,
  message,
  channel,
  activeCourse,
  onActiveCourseChange,
  orderForTableId,
  onOrderForTableChange,
  onTabChange,
  onSelectLine,
  onSelectSubmitted,
  onSearchChange,
  onAllergenToggle,
  onSelectCat,
  onAddProduct,
  onConfirmVariants,
  onCancelVariants,
  onUpdateCart,
  onLeaveTable,
  onSpedisci,
  onMarcia,
  onPreconto,
  onReleaseDessert,
  onDiscountLine,
  onStorno,
  onPriceOverride,
  onEditVariants,
  onEditNote,
  onSaveNote,
  onCancelNote,
  onAcquireLock,
  onOpenTransfer,
  onEditGuests,
}: {
  table: LiveTable;
  tables: LiveTable[];
  operator: Operator;
  menu: MenuSnapshot;
  categories: Category[];
  cart: CartLine[];
  submittedLines: SubmittedLine[];
  workspaceTab: WorkspaceTab;
  selectedLineId: string | null;
  selectedSubmittedId: string | null;
  noteLineId: string | null;
  search: string;
  allergenFilter: string[];
  selectedCat: string | null;
  variantProduct: Product | null;
  isOffline: boolean;
  hasLock: boolean;
  message: string;
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  activeCourse: number;
  onActiveCourseChange: (course: number) => void;
  orderForTableId?: string | null;
  onOrderForTableChange?: (tableId: string) => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onSelectLine: (lineId: string | null) => void;
  onSelectSubmitted: (lineId: string | null) => void;
  onSearchChange: (v: string) => void;
  onAllergenToggle: (id: string) => void;
  onSelectCat: (id: string) => void;
  onAddProduct: (p: Product) => void;
  onConfirmVariants: (v: VariantSelection[]) => void;
  onCancelVariants: () => void;
  onUpdateCart: (updater: (prev: CartLine[]) => CartLine[]) => void;
  onLeaveTable: () => void;
  onSpedisci: () => void;
  onMarcia: (course: number) => void;
  onPreconto: () => void;
  onReleaseDessert: () => void;
  onDiscountLine: (lineId: string) => void;
  onStorno: (line: SubmittedLine) => void;
  onPriceOverride: (target: { kind: "cart" | "submitted"; lineId: string }) => void;
  onEditVariants: (line: CartLine) => void;
  onEditNote: (line: CartLine) => void;
  onSaveNote: (lineId: string, note: string) => void;
  onCancelNote: () => void;
  onAcquireLock: () => void;
  onOpenTransfer?: () => void;
  onEditGuests?: () => void;
}) {
  const [courseModalLineId, setCourseModalLineId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [marciaPicker, setMarciaPicker] = useState(false);
  const [editConfirm, setEditConfirm] = useState<EditConfirm | null>(null);

  const liveTable = resolveLiveTable(table, tables);
  const unionTables = isUnionHost(liveTable) ? unionMembers(liveTable, tables) : [];
  const orderTargetId = orderForTableId ?? liveTable.id;
  const speditoLines = isUnionHost(liveTable)
    ? cart.filter((l) => (l.forTableId ?? liveTable.id) === orderTargetId)
    : cart;
  const orderTargetLabel = unionTables.find((m) => m.id === orderTargetId)?.label;

  const selectedLine = cart.find((l) => l.lineId === selectedLineId) ?? null;
  const selectedSubmitted =
    submittedLines.find((l) => l.lineId === selectedSubmittedId) ?? null;
  const noteLine = cart.find((l) => l.lineId === noteLineId) ?? null;
  const draftTotal = cartTotal(cart);
  const tableTotal = tableOrderTotal(cart, submittedLines);
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const groups = groupCartByCourse(cart);
  const suggestedMarcia = suggestMarciaCourse(cart);
  const needsLock = !hasLock && table.status !== "FREE";
  const canOpenTransfer =
    !isOffline &&
    table.status !== "FREE" &&
    table.status !== "SPLIT_IN_PROGRESS" &&
    (cart.length > 0 || submittedLines.length > 0);
  const hasSelection = !!selectedLine || !!selectedSubmitted;
  const products = menu.products ?? [];
  const selectedProduct = selectedLine
    ? products.find((p) => p.id === selectedLine.productId)
    : undefined;
  const selectedLineHasVariants = selectedProduct
    ? variantsForProduct(selectedProduct, menu.variantGroups ?? []).length > 0
    : false;

  const productVariants = variantProduct
    ? variantsForProduct(variantProduct, menu.variantGroups ?? [])
    : [];

  const applyQty = (line: CartLine, nextQty: number) => {
    if (nextQty <= 0) {
      onUpdateCart((prev) => prev.filter((l) => l.lineId !== line.lineId));
      onSelectLine(null);
      return;
    }
    onUpdateCart((prev) =>
      prev.map((l) => (l.lineId === line.lineId ? { ...l, quantity: nextQty } : l)),
    );
  };

  const applyDelete = (line: CartLine) => {
    onUpdateCart((prev) => prev.filter((l) => l.lineId !== line.lineId));
    onSelectLine(null);
  };

  const applyCourseToLine = (lineId: string, course: number) => {
    const c = normalizeCourse(course);
    // Solo la riga selezionata cambia portata; più piatti possono condividere
    // la stessa course (Ora / Segue) in modo indipendente.
    onUpdateCart((prev) =>
      prev.map((l) =>
        l.lineId === lineId
          ? {
              ...l,
              course: c,
              hold: isOraCourse(c) ? false : l.hold || true,
            }
          : l,
      ),
    );
    setCourseModalLineId(null);
  };

  const applyHold = (course: number, enable: boolean) => {
    const c = normalizeCourse(course);
    onUpdateCart((prev) =>
      prev.map((l) => (normalizeCourse(l.course) === c ? { ...l, hold: enable } : l)),
    );
  };

  const executeEditConfirm = () => {
    if (!editConfirm) return;
    switch (editConfirm.type) {
      case "delete":
        applyDelete(editConfirm.line);
        break;
      case "qty":
        applyQty(editConfirm.line, editConfirm.nextQty);
        break;
      case "hold":
        applyHold(editConfirm.course, editConfirm.enable);
        break;
      case "course":
        applyCourseToLine(editConfirm.lineId, editConfirm.course);
        break;
    }
    setEditConfirm(null);
  };

  const requestQtyChange = (delta: number) => {
    if (!selectedLine) return;
    const nextQty = selectedLine.quantity + delta;
    if (delta > 0) {
      applyQty(selectedLine, nextQty);
      return;
    }
    if (nextQty <= 0) {
      setEditConfirm({ type: "delete", line: selectedLine });
    } else {
      setEditConfirm({ type: "qty", line: selectedLine, nextQty });
    }
  };

  const requestDelete = () => {
    if (!selectedLine) return;
    setEditConfirm({ type: "delete", line: selectedLine });
  };

  const requestCourseChange = (course: number) => {
    if (!courseModalLineId || !courseModalLine) return;
    if (normalizeCourse(courseModalLine.course) === normalizeCourse(course)) {
      setCourseModalLineId(null);
      return;
    }
    setEditConfirm({
      type: "course",
      lineId: courseModalLineId,
      lineName: courseModalLine.name,
      course,
    });
    setCourseModalLineId(null);
  };

  const requestHoldToggle = (course: number) => {
    const onHold = isCourseOnHold(groups.get(course) ?? []);
    setEditConfirm({ type: "hold", course, enable: !onHold });
  };

  const editConfirmCopy = (c: EditConfirm) => {
    switch (c.type) {
      case "delete":
        return {
          title: "Eliminare la riga?",
          message: `Rimuovere ${c.line.quantity}× ${c.line.name} dalla comanda?`,
          confirmLabel: "Elimina",
          variant: "danger" as const,
        };
      case "qty":
        return {
          title: "Modificare quantità?",
          message: `Portare «${c.line.name}» da ${c.line.quantity} a ${c.nextQty}?`,
          confirmLabel: "Conferma",
        };
      case "hold":
        return {
          title: c.enable ? "Attivare HOLD?" : "Togliere HOLD?",
          message: c.enable
            ? `Sospendere in cucina tutti i piatti di ${stepLabel(c.course)}?`
            : `Inviare subito in preparazione i piatti di ${stepLabel(c.course)}?`,
          confirmLabel: "Conferma",
        };
      case "course":
        return {
          title: "Cambiare portata?",
          message: `Spostare «${c.lineName}» in ${stepLabel(c.course)}?`,
          confirmLabel: "Conferma",
        };
    }
  };

  const handleMarciaClick = () => {
    if (suggestedMarcia != null) {
      onMarcia(suggestedMarcia);
      return;
    }
    setMarciaPicker(true);
  };

  const courseModalLine = cart.find((l) => l.lineId === courseModalLineId);
  const footerPad = hasSelection ? "pb-44" : "pb-28";
  const confirmCopy = editConfirm ? editConfirmCopy(editConfirm) : null;
  const showMenu = workspaceTab === "menu";
  const showComanda = workspaceTab === "comanda";

  const comandaList = (
    <div className="space-y-4 p-3">
      {submittedLines.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Già inviati
          </h2>
          <ul className="space-y-2">
            {submittedLines.map((l) => {
              const remaining = l.quantity - (l.voidedQuantity ?? 0);
              if (remaining <= 0) return null;
              const active = selectedSubmittedId === l.lineId;
              const price = linePriceParts({
                unitPrice: l.unitPrice,
                basePrice: l.basePrice,
                quantity: remaining,
                variants: l.variants ?? [],
              });
              return (
                <li key={l.lineId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSubmitted(active ? null : l.lineId);
                      onSelectLine(null);
                    }}
                    className={`flex min-h-14 w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm ${
                      active
                        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                        : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30"
                    }`}
                  >
                    <span className="opacity-50">🔒</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {remaining}× {l.name}
                      </span>
                      {l.forTableLabel && (
                        <span className="mt-0.5 inline-block rounded bg-[hsl(var(--pg-muted))] px-1.5 py-0.5 text-[11px] font-semibold">
                          {formatTableLabel(l.forTableLabel)}
                        </span>
                      )}
                      {(l.variants?.length ?? 0) > 0 && (
                        <span className="block truncate text-xs text-[hsl(var(--pg-muted-foreground))]">
                          {(l.variants ?? [])
                            .map((v) =>
                              v.type === "REMOVE" ? `−${v.name}` : `+${v.name}`,
                            )
                            .join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-[hsl(var(--pg-foreground))]">
                        €{price.total.toFixed(2)}
                      </span>
                      {price.detail && (
                        <span className="block text-[11px] text-[hsl(var(--pg-muted-foreground))]">
                          {price.detail}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {cart.length === 0 && submittedLines.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[hsl(var(--pg-muted-foreground))]">Nessun articolo in bozza</p>
          <p className="mt-2 hidden text-sm text-[hsl(var(--pg-muted-foreground))] tablet-l:block">
            Tocca un piatto dal menu a destra
          </p>
          <Button
            className="mt-4 min-h-12 w-full max-w-xs tablet-l:hidden"
            onClick={() => onTabChange("menu")}
          >
            Apri Menu
          </Button>
        </div>
      ) : (
        cart.length > 0 &&
        [...groups.entries()].map(([course, lines]) => {
          const onHold = isCourseOnHold(lines);
          return (
            <section key={course}>
              <div
                className={`mb-2 flex items-center justify-between rounded-xl px-3 py-2.5 ${
                  isOraCourse(course)
                    ? "bg-amber-500/12 text-amber-900"
                    : "bg-[hsl(var(--pg-muted))]/80"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider">
                  {stepLabel(course)}
                  <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                    ({lines.reduce((n, l) => n + l.quantity, 0)})
                  </span>
                </span>
                {!isOraCourse(course) && (
                  <button
                    type="button"
                    onClick={() => requestHoldToggle(course)}
                    className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                      onHold ? "bg-orange-500 text-white" : "bg-[hsl(var(--pg-background))]"
                    }`}
                  >
                    {onHold ? "HOLD" : "Via"}
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {lines.map((l) => {
                  const active = selectedLineId === l.lineId;
                  const price = linePriceParts(l);
                  return (
                    <li key={l.lineId}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectLine(active ? null : l.lineId);
                          onSelectSubmitted(null);
                        }}
                        className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                          active
                            ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                            : "border-[hsl(var(--pg-border))]"
                        }`}
                      >
                        <span className="min-w-0 flex-1 pr-3">
                          <p className="font-medium">
                            {l.quantity}× {l.name}
                          </p>
                          {l.forTableLabel && (
                            <span className="mt-0.5 inline-block rounded bg-[hsl(var(--pg-muted))] px-1.5 py-0.5 text-[11px] font-semibold">
                              {formatTableLabel(l.forTableLabel)}
                            </span>
                          )}
                          {(l.variants.length > 0 || l.notes) && (
                            <p className="truncate text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {l.variants
                                .map((v) =>
                                  v.type === "REMOVE" ? `−${v.name}` : `+${v.name}`,
                                )
                                .join(", ")}
                              {l.notes && (l.variants.length ? ` · ${l.notes}` : l.notes)}
                            </p>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">
                            €{price.total.toFixed(2)}
                          </span>
                          {price.detail && (
                            <span className="block text-[11px] tabular-nums text-[hsl(var(--pg-muted-foreground))]">
                              {price.detail}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );

  const menuColumn = (
    <div className="flex h-full min-h-0 flex-col">
      <CourseStepBar
        activeCourse={activeCourse}
        cart={cart}
        disabled={needsLock}
        onSelect={onActiveCourseChange}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MenuPanel
          menu={menu}
          categories={categories}
          selectedCat={selectedCat}
          search={search}
          allergenFilter={allergenFilter}
          channel={channel}
          onSelectCat={onSelectCat}
          onSearchChange={onSearchChange}
          onAllergenToggle={onAllergenToggle}
          onAddProduct={onAddProduct}
        />
      </div>
    </div>
  );

  return (
    <main className="flex h-screen max-h-screen flex-col overflow-hidden bg-[hsl(var(--pg-background))]">
      {isOffline && (
        <div className="shrink-0 bg-yellow-500/90 px-3 py-1.5 text-center text-xs font-medium text-black">
          Offline — SPEDITO disabilitato
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-[hsl(var(--pg-border))]">
        <div className="flex items-center gap-2 px-3 pt-2">
          <button
            type="button"
            onClick={onLeaveTable}
            className="min-h-10 shrink-0 pr-1 text-sm font-medium text-[hsl(var(--pg-primary))]"
          >
            ← Tavoli
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight">
            {compactMergedTableLabel(liveTable, tables)}
          </h1>
          <p className="shrink-0 text-base font-bold tabular-nums">
            €{tableTotal.toFixed(2)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 pb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
          <span>{operator.firstName}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            className="font-medium text-[hsl(var(--pg-primary))] underline-offset-2 hover:underline"
            onClick={onEditGuests}
          >
            {formatUnionGuests(liveTable, tables, { long: true }) || "Imposta coperti"}
          </button>
          {cartCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{cartCount} in bozza</span>
            </>
          )}
        </div>
        {unionTables.length > 1 && onOrderForTableChange && (
          <div className="flex items-center gap-2 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/25 px-3 py-2">
            <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
              Aggiungi a
            </p>
            <div className="flex min-w-0 flex-1 gap-1.5">
              {unionTables.map((m) => {
                const selected = m.id === orderTargetId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOrderForTableChange(m.id)}
                    className={`min-h-10 min-w-0 flex-1 truncate rounded-full px-3 text-sm font-semibold transition ${
                      selected
                        ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                        : "bg-[hsl(var(--pg-background))] text-[hsl(var(--pg-foreground))] ring-1 ring-[hsl(var(--pg-border))]"
                    }`}
                  >
                    {unionMemberChipLabel(m, { compact: true })}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {needsLock && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="text-amber-900">
            {table.lockedBy && table.lockedBy !== operator.id
              ? `In uso da ${table.lockedByName ?? "altro operatore"} — serve PIN manager`
              : table.isVirtual
                ? "Premi Prendi per prendere in carico l'ordine"
                : "Premi Prendi per prendere in carico il tavolo"}
          </span>
          <Button className="min-h-10 shrink-0" onClick={onAcquireLock}>
            Prendi
          </Button>
        </div>
      )}

      {message && !message.startsWith("Tavoli uniti:") && (
        <p className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-2 text-sm">{message}</p>
      )}

      {/* Tab bar — solo portrait / schermi stretti */}
      <nav className="flex shrink-0 gap-1 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-2 tablet-l:hidden">
        <TabButton
          label="Comanda"
          badge={cartCount > 0 ? cartCount : undefined}
          active={workspaceTab === "comanda"}
          onClick={() => onTabChange("comanda")}
        />
        <TabButton
          label="Menu"
          active={workspaceTab === "menu"}
          onClick={() => onTabChange("menu")}
        />
      </nav>

      {/* Contenuto: portrait = tab; landscape tablet = Comanda | Menu */}
      <div className={`flex min-h-0 flex-1 flex-col tablet-l:flex-row ${footerPad}`}>
        <div
          className={`min-h-0 flex-1 overflow-y-auto tablet-l:border-r tablet-l:border-[hsl(var(--pg-border))] ${
            showComanda ? "block" : "hidden"
          } tablet-l:block`}
        >
          {comandaList}
        </div>
        <div
          className={`min-h-0 flex-1 overflow-hidden ${
            showMenu ? "block" : "hidden"
          } tablet-l:block`}
        >
          {menuColumn}
        </div>
      </div>

      {/* Azioni riga selezionata */}
      {hasSelection && (
        <div className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]/95 px-3 py-2.5 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
            {selectedLine && (
              <>
                <ActionChip label="−" disabled={needsLock} onClick={() => requestQtyChange(-1)} />
                <ActionChip label="+" disabled={needsLock} onClick={() => requestQtyChange(1)} />
                {selectedLineHasVariants && (
                  <ActionChip
                    label="Modifica"
                    disabled={needsLock}
                    onClick={() => onEditVariants(selectedLine)}
                  />
                )}
                <ActionChip
                  label="Nota"
                  disabled={needsLock}
                  onClick={() => onEditNote(selectedLine)}
                />
                <ActionChip
                  label="Portata"
                  disabled={needsLock}
                  onClick={() => setCourseModalLineId(selectedLine.lineId)}
                />
                <ActionChip
                  label="Prezzo"
                  disabled={needsLock}
                  onClick={() => onPriceOverride({ kind: "cart", lineId: selectedLine.lineId })}
                />
                <ActionChip label="Elimina" disabled={needsLock} onClick={requestDelete} />
              </>
            )}
            {selectedSubmitted && !selectedLine && (
              <>
                <ActionChip
                  label="Prezzo"
                  onClick={() =>
                    onPriceOverride({ kind: "submitted", lineId: selectedSubmitted.lineId })
                  }
                />
                <ActionChip label="Storno" onClick={() => onStorno(selectedSubmitted)} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer fisso */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-4 gap-2">
          <Button
            className="min-h-12 text-sm leading-tight"
            disabled={speditoLines.length === 0 || isOffline || needsLock}
            onClick={onSpedisci}
          >
            {orderTargetLabel && isUnionHost(liveTable) ? (
              <>
                <span className="block text-xs font-normal opacity-90">
                  {formatTableLabel(orderTargetLabel)}
                </span>
                <span>Spedisci</span>
              </>
            ) : (
              "Spedisci"
            )}
          </Button>
          <Button
            variant="outline"
            className="min-h-12 text-sm"
            disabled={isOffline}
            onClick={handleMarciaClick}
          >
            {suggestedMarcia != null ? "Marcia ▶" : "Marcia"}
          </Button>
          <Button variant="outline" className="min-h-12 text-sm" disabled={isOffline} onClick={onPreconto}>
            Preconto
          </Button>
          <Button
            variant="outline"
            className="min-h-12 px-0 text-lg"
            onClick={() => setMoreOpen(true)}
            aria-label="Altre opzioni"
          >
            ≡
          </Button>
        </div>
      </footer>

      {moreOpen && (
        <BottomSheet maxHeightClass="max-h-[70dvh]" zClass="z-40">
            <div className="px-4 pb-2 pt-1">
              <h3 className="mb-3 font-semibold">Altre opzioni</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="min-h-12 w-full justify-start"
                  disabled={!canOpenTransfer || !onOpenTransfer}
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenTransfer?.();
                  }}
                >
                  Sposta conto su altro tavolo
                </Button>
                <Button
                  variant="outline"
                  className="min-h-12 w-full justify-start"
                  disabled={isOffline}
                  onClick={() => {
                    setMoreOpen(false);
                    onReleaseDessert();
                  }}
                >
                  X DOLCE
                </Button>
                <Button
                  variant="outline"
                  className="min-h-12 w-full justify-start"
                  disabled={!selectedLine || needsLock}
                  onClick={() => {
                    if (selectedLine) {
                      setMoreOpen(false);
                      onDiscountLine(selectedLine.lineId);
                    }
                  }}
                >
                  Sconto % sulla riga
                </Button>
              </div>
            </div>
            <div className={bottomSheetFooterClass}>
              <Button variant="ghost" className="min-h-12 w-full" onClick={() => setMoreOpen(false)}>
                Chiudi
              </Button>
            </div>
        </BottomSheet>
      )}

      {confirmCopy && (
        <ConfirmModal
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          variant={confirmCopy.variant}
          onConfirm={executeEditConfirm}
          onCancel={() => setEditConfirm(null)}
        />
      )}

      {courseModalLine && (
        <CourseOptionsModal
          currentCourse={normalizeCourse(courseModalLine.course)}
          onSelect={requestCourseChange}
          onCancel={() => setCourseModalLineId(null)}
        />
      )}

      {marciaPicker && (
        <CourseOptionsModal
          title="Marcia — quale portata?"
          currentCourse={-1}
          onSelect={(c) => {
            setMarciaPicker(false);
            onMarcia(c);
          }}
          onCancel={() => setMarciaPicker(false)}
        />
      )}

      {noteLine && (
        <NoteModal
          lineName={noteLine.name}
          initialNote={noteLine.notes}
          onSave={(note) => onSaveNote(noteLine.lineId, note)}
          onCancel={onCancelNote}
        />
      )}

      {variantProduct && (
        <VariantSheet
          product={variantProduct}
          variants={productVariants}
          basePrice={resolvePrice(variantProduct, channel, menu.prices ?? [])}
          onConfirm={onConfirmVariants}
          onCancel={onCancelVariants}
        />
      )}
    </main>
  );
}

function TabButton({
  label,
  badge,
  active,
  onClick,
}: {
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-11 flex-1 rounded-lg border text-sm font-semibold transition ${
        active
          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10 text-[hsl(var(--pg-primary))]"
          : "border-transparent text-[hsl(var(--pg-muted-foreground))] hover:bg-[hsl(var(--pg-background))]/60 hover:text-[hsl(var(--pg-foreground))]"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1 text-xs text-[hsl(var(--pg-primary-foreground))]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function ActionChip({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 min-w-[3.25rem] flex-1 basis-[4.5rem] rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/40 px-3 text-sm font-semibold disabled:opacity-30"
    >
      {label}
    </button>
  );
}
