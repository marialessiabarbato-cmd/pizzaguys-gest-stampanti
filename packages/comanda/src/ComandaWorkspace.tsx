import { isHeldCourse } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useRef, useState } from "react";
import {
  groupCartByCourse,
  isOraCourse,
  normalizeCourse,
  stepLabel,
  suggestMarciaCourse,
} from "./course";
import { cartTotal, resolvePrice, tableOrderTotal, variantsForProduct } from "./menu";
import {
  compactMergedTableLabel,
  formatTableLabel,
  formatUnionGuests,
  isUnionHost,
  resolveLiveTable,
  unionMemberChipLabel,
  unionMembers,
} from "./table-display";
import type { CartLine, LastAddedLine, LiveTable, Operator } from "./types";
import { BottomSheet, SheetLayoutProvider, bottomSheetFooterClass } from "./ui/BottomSheet";
import { ConfirmModal } from "./ui/ConfirmModal";
import { CourseOptionsModal } from "./ui/CourseOptionsModal";
import { CourseStepBar } from "./ui/CourseStepBar";
import { MenuPanel } from "./ui/MenuPanel";
import { NoteModal } from "./ui/NoteModal";
import { PinModal } from "./ui/PinModal";
import { PriceOverrideModal } from "./ui/PriceOverrideModal";
import { ShiftInactiveBanner } from "./ui/ShiftInactiveBanner";
import { StornoQtyModal } from "./ui/StornoQtyModal";
import { VariantSheet } from "./ui/VariantSheet";
import type { Comanda } from "./useComanda";

/**
 * - "handheld": palmare, schede Comanda/Menu (affiancate su tablet orizzontale), barre fisse in basso.
 * - "cassa": dentro il pannello della cassa, menu a tessere a sinistra e comanda a destra.
 */
export type ComandaLayout = "handheld" | "cassa";

type EditConfirm =
  | { type: "delete"; line: CartLine }
  | { type: "qty"; line: CartLine; nextQty: number }
  | { type: "course"; lineId: string; lineName: string; course: number };

/** Totale riga + dettaglio base + aggiunte (per click → modifica prezzo). */
function linePriceParts(l: {
  unitPrice: number;
  basePrice?: number;
  quantity: number;
  variants?: CartLine["variants"];
  discountPercent?: number;
}): { total: number; detail: string | null } {
  const qty = Math.max(1, l.quantity);
  const discount = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
  const total = Math.round(l.unitPrice * qty * discount * 100) / 100;
  const adds = (l.variants ?? []).filter((v) => v.type === "ADD");
  if (adds.length === 0) return { total, detail: null };
  const addSum = adds.reduce((s, v) => s + (Number(v.priceDelta) || 0), 0);
  const inferredBase =
    l.basePrice != null && l.basePrice > 0 ? l.basePrice : Math.round((l.unitPrice - addSum) * 100) / 100;
  const basePart = Math.round(inferredBase * qty * 100) / 100;
  const addParts = adds.map((v) => `€${(Math.round((Number(v.priceDelta) || 0) * qty * 100) / 100).toFixed(2)}`);
  return { total, detail: `€${basePart.toFixed(2)} + ${addParts.join(" + ")}` };
}

export function ComandaWorkspace({
  comanda: c,
  layout,
  table,
  tables,
  operator,
  isOffline,
  shiftInactive,
  hasLock = true,
  message,
  backLabel,
  onLeave,
  onAcquireLock,
  onEditGuests,
  onOpenTransfer,
  precontoCopy = {
    title: "Richiedere preconto?",
    message: "La cassa riceverà una notifica per stampare il preconto.",
  },
  showShiftBanner = true,
}: {
  comanda: Comanda;
  layout: ComandaLayout;
  table: LiveTable;
  tables: LiveTable[];
  operator: Operator;
  isOffline: boolean;
  shiftInactive: boolean;
  /** Il palmare deve "prendere" il tavolo prima di modificarlo; la cassa lo prende entrando. */
  hasLock?: boolean;
  message: string;
  backLabel: string;
  /** Uscita dalla comanda (già confermata se c'erano piatti non spediti). */
  onLeave: () => void;
  onAcquireLock?: () => void;
  onEditGuests?: () => void;
  onOpenTransfer?: () => void;
  precontoCopy?: { title: string; message: string };
  /** La cassa mostra già il proprio banner turno nell'intestazione. */
  showShiftBanner?: boolean;
}) {
  const isCassa = layout === "cassa";
  const [courseModalLineId, setCourseModalLineId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [marciaPicker, setMarciaPicker] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [editConfirm, setEditConfirm] = useState<EditConfirm | null>(null);
  const [addedToast, setAddedToast] = useState<LastAddedLine | null>(null);
  const comandaRef = useRef<HTMLDivElement>(null);

  const { menu, cart, submittedLines, lastAdded, selectedLineId, selectedSubmittedId } = c;

  // Feedback aggiunta piatto: avviso temporaneo e riga portata in vista.
  useEffect(() => {
    if (!lastAdded) {
      setAddedToast(null);
      return;
    }
    setAddedToast(lastAdded);
    const frame = requestAnimationFrame(() => {
      comandaRef.current
        ?.querySelector(`[data-line-id="${lastAdded.lineId}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setAddedToast(null), 3500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [lastAdded]);

  if (!menu) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-[hsl(var(--pg-muted-foreground))]">
        Caricamento menu…
      </div>
    );
  }

  const liveTable = resolveLiveTable(table, tables);
  const unionTables = isUnionHost(liveTable) ? unionMembers(liveTable, tables) : [];
  const orderTargetId = c.orderForTableId ?? liveTable.id;
  const speditoLines = isUnionHost(liveTable)
    ? cart.filter((l) => (l.forTableId ?? liveTable.id) === orderTargetId)
    : cart;
  const orderTargetLabel = unionTables.find((m) => m.id === orderTargetId)?.label;

  const selectedLine = cart.find((l) => l.lineId === selectedLineId) ?? null;
  const selectedSubmitted = submittedLines.find((l) => l.lineId === selectedSubmittedId) ?? null;
  const noteLine = cart.find((l) => l.lineId === c.noteLineId) ?? null;
  const tableTotal = tableOrderTotal(cart, submittedLines);
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartQtyByProduct = cart.reduce<Record<string, number>>((acc, l) => {
    acc[l.productId] = (acc[l.productId] ?? 0) + l.quantity;
    return acc;
  }, {});
  const addedToastQty = addedToast ? (cart.find((l) => l.lineId === addedToast.lineId)?.quantity ?? 0) : 0;
  const groups = groupCartByCourse(cart);
  const suggestedMarcia = suggestMarciaCourse(cart);
  const needsLock = !hasLock && table.status !== "FREE";
  const canOpenTransfer =
    !isOffline &&
    table.status !== "FREE" &&
    table.status !== "SPLIT_IN_PROGRESS" &&
    (cart.length > 0 || submittedLines.length > 0);
  const hasSelection = !!selectedLine || !!selectedSubmitted;
  const selectedProduct = selectedLine ? c.products.find((p) => p.id === selectedLine.productId) : undefined;
  const selectedLineHasVariants = selectedProduct
    ? variantsForProduct(selectedProduct, menu.variantGroups ?? []).length > 0
    : false;
  const editProduct = c.editCartLine ? (c.products.find((p) => p.id === c.editCartLine!.productId) ?? null) : null;
  const courseModalLine = cart.find((l) => l.lineId === courseModalLineId);

  const applyQty = (line: CartLine, nextQty: number) => {
    if (nextQty <= 0) {
      c.setCart((prev) => prev.filter((l) => l.lineId !== line.lineId));
      c.setSelectedLineId(null);
      return;
    }
    c.setCart((prev) => prev.map((l) => (l.lineId === line.lineId ? { ...l, quantity: nextQty } : l)));
  };

  /** Annulla l'ultima aggiunta: toglie un pezzo (o la riga se era l'unico). */
  const undoLastAdded = () => {
    if (!addedToast) return;
    const line = cart.find((l) => l.lineId === addedToast.lineId);
    if (line) applyQty(line, line.quantity - 1);
    setAddedToast(null);
  };

  const applyCourseToLine = (lineId: string, course: number) => {
    const cn = normalizeCourse(course);
    c.setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, course: cn, hold: isHeldCourse(cn) } : l)),
    );
  };

  const executeEditConfirm = () => {
    if (!editConfirm) return;
    if (editConfirm.type === "delete") {
      c.setCart((prev) => prev.filter((l) => l.lineId !== editConfirm.line.lineId));
      c.setSelectedLineId(null);
    } else if (editConfirm.type === "qty") {
      applyQty(editConfirm.line, editConfirm.nextQty);
    } else {
      applyCourseToLine(editConfirm.lineId, editConfirm.course);
    }
    setEditConfirm(null);
  };

  const requestQtyChange = (delta: number) => {
    if (!selectedLine) return;
    const nextQty = selectedLine.quantity + delta;
    if (delta > 0) applyQty(selectedLine, nextQty);
    else if (nextQty <= 0) setEditConfirm({ type: "delete", line: selectedLine });
    else setEditConfirm({ type: "qty", line: selectedLine, nextQty });
  };

  const requestCourseChange = (course: number) => {
    if (!courseModalLine) return;
    setCourseModalLineId(null);
    if (normalizeCourse(courseModalLine.course) === normalizeCourse(course)) return;
    setEditConfirm({ type: "course", lineId: courseModalLine.lineId, lineName: courseModalLine.name, course });
  };

  const confirmCopy = (() => {
    if (!editConfirm) return null;
    switch (editConfirm.type) {
      case "delete":
        return {
          title: "Eliminare la riga?",
          message: `Rimuovere ${editConfirm.line.quantity}× ${editConfirm.line.name} dalla comanda?`,
          confirmLabel: "Elimina",
          variant: "danger" as const,
        };
      case "qty":
        return {
          title: "Modificare quantità?",
          message: `Portare «${editConfirm.line.name}» da ${editConfirm.line.quantity} a ${editConfirm.nextQty}?`,
          confirmLabel: "Conferma",
        };
      case "course":
        return {
          title: "Cambiare portata?",
          message: `Spostare «${editConfirm.lineName}» in ${stepLabel(editConfirm.course)}?`,
          confirmLabel: "Conferma",
        };
    }
  })();

  const handleBack = () => {
    if (cart.length > 0) setExitConfirm(true);
    else onLeave();
  };

  const handleMarciaClick = () => {
    if (suggestedMarcia != null) c.setConfirmCallCourse(suggestedMarcia);
    else setMarciaPicker(true);
  };

  const selectLine = (lineId: string | null) => {
    c.setSelectedLineId(lineId);
    c.setSelectedSubmittedId(null);
  };
  const selectSubmitted = (lineId: string | null) => {
    c.setSelectedSubmittedId(lineId);
    c.setSelectedLineId(null);
  };

  const comandaList = (
    <div ref={comandaRef} className="space-y-4 p-3">
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
                    onClick={() => selectSubmitted(active ? null : l.lineId)}
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
                        <span className="mt-0.5 inline-block rounded bg-[hsl(var(--pg-muted))] px-1.5 py-0.5 text-2xs font-semibold">
                          {formatTableLabel(l.forTableLabel)}
                        </span>
                      )}
                      {(l.variants?.length ?? 0) > 0 && (
                        <span className="block truncate text-xs text-[hsl(var(--pg-muted-foreground))]">
                          {(l.variants ?? []).map((v) => (v.type === "REMOVE" ? `−${v.name}` : `+${v.name}`)).join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-[hsl(var(--pg-foreground))]">€{price.total.toFixed(2)}</span>
                      {price.detail && (
                        <span className="block text-2xs text-[hsl(var(--pg-muted-foreground))]">{price.detail}</span>
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
          <p
            className={`mt-2 text-sm text-[hsl(var(--pg-muted-foreground))] ${
              isCassa ? "" : "hidden tablet-l:block"
            }`}
          >
            {isCassa ? "Tocca un piatto dal menu a sinistra" : "Tocca un piatto dal menu a destra"}
          </p>
          {!isCassa && (
            <Button className="mt-4 min-h-12 w-full max-w-xs tablet-l:hidden" onClick={() => c.setWorkspaceTab("menu")}>
              Apri Menu
            </Button>
          )}
        </div>
      ) : (
        cart.length > 0 &&
        [...groups.entries()].map(([course, lines]) => (
          <section key={course}>
            <div
              className={`mb-2 flex items-center justify-between rounded-xl px-3 py-2.5 ${
                isOraCourse(course) ? "bg-amber-500/12 text-amber-900" : "bg-[hsl(var(--pg-muted))]/80"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wider">
                {stepLabel(course)}
                <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                  ({lines.reduce((n, l) => n + l.quantity, 0)})
                </span>
              </span>
              {/* Il HOLD non si sceglie: i Segue aspettano sempre la Marcia. */}
              {!isOraCourse(course) && (
                <span className="rounded-full bg-[hsl(var(--pg-background))] px-3 py-1 text-xs font-medium text-[hsl(var(--pg-muted-foreground))]">
                  in attesa · Marcia
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {lines.map((l) => {
                const active = selectedLineId === l.lineId;
                const justAdded = lastAdded?.lineId === l.lineId;
                const price = linePriceParts(l);
                return (
                  <li key={l.lineId} data-line-id={l.lineId}>
                    <button
                      // Chiave nuova a ogni aggiunta per far ripartire l'animazione.
                      key={justAdded ? `added-${lastAdded.seq}` : "line"}
                      type="button"
                      onClick={() => selectLine(active ? null : l.lineId)}
                      className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                        justAdded ? "pg-added-flash " : ""
                      }${
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
                          <span className="mt-0.5 inline-block rounded bg-[hsl(var(--pg-muted))] px-1.5 py-0.5 text-2xs font-semibold">
                            {formatTableLabel(l.forTableLabel)}
                          </span>
                        )}
                        {l.variants.length > 0 && (
                          <p className="truncate text-xs text-[hsl(var(--pg-muted-foreground))]">
                            {l.variants.map((v) => (v.type === "REMOVE" ? `−${v.name}` : `+${v.name}`)).join(", ")}
                          </p>
                        )}
                        {l.notes && (
                          <p className="mt-0.5 break-words text-xs font-medium italic text-amber-700">Nota: {l.notes}</p>
                        )}
                        {l.discountPercent ? (
                          <p className="mt-0.5 text-xs text-green-700">Sconto −{l.discountPercent}%</p>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold tabular-nums">€{price.total.toFixed(2)}</span>
                        {price.detail && (
                          <span className="block text-2xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
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
        ))
      )}
    </div>
  );

  const menuColumn = (
    <div className="flex h-full min-h-0 flex-col">
      <CourseStepBar activeCourse={c.activeCourse} cart={cart} disabled={needsLock} onSelect={c.setActiveCourse} />
      <div className={`min-h-0 flex-1 ${isCassa ? "flex flex-col" : "overflow-y-auto"}`}>
        <MenuPanel
          menu={menu}
          categories={c.categories}
          selectedCat={c.selectedCat}
          search={c.search}
          allergenFilter={c.allergenFilter}
          channel={c.channel}
          onSelectCat={c.setSelectedCat}
          onSearchChange={c.setSearch}
          onAllergenToggle={c.toggleAllergen}
          onAddProduct={c.addProduct}
          cartQtyByProduct={cartQtyByProduct}
          lastAdded={lastAdded}
          variant={isCassa ? "grid" : "list"}
        />
      </div>
    </div>
  );

  const addedToastEl =
    addedToast && addedToastQty > 0 ? (
      <div className="flex justify-center px-4 pb-2">
        <div
          key={addedToast.seq}
          role="status"
          aria-live="polite"
          className="pg-toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-[hsl(var(--pg-foreground))] py-2 pl-4 pr-2 text-sm text-[hsl(var(--pg-background))] shadow-lg"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">✓ {addedToast.name}</span>
            <span className="block text-xs opacity-80">
              {stepLabel(addedToast.course)}
              {addedToastQty > 1 ? ` · ${addedToastQty} in bozza` : ""}
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
    ) : null;

  const selectionBar = hasSelection ? (
    <div className="pointer-events-auto border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]/95 px-3 py-2.5 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2">
        {selectedLine && (
          <>
            <ActionChip label="−" disabled={needsLock} onClick={() => requestQtyChange(-1)} />
            <ActionChip label="+" disabled={needsLock} onClick={() => requestQtyChange(1)} />
            {selectedLineHasVariants && (
              <ActionChip label="Modifica" disabled={needsLock} onClick={() => c.editVariants(selectedLine)} />
            )}
            <ActionChip label="Nota" disabled={needsLock} onClick={() => c.setNoteLineId(selectedLine.lineId)} />
            <ActionChip label="Portata" disabled={needsLock} onClick={() => setCourseModalLineId(selectedLine.lineId)} />
            <ActionChip
              label="Prezzo"
              disabled={needsLock}
              onClick={() => c.openPriceOverride({ kind: "cart", lineId: selectedLine.lineId })}
            />
            <ActionChip
              label="Elimina"
              disabled={needsLock}
              onClick={() => setEditConfirm({ type: "delete", line: selectedLine })}
            />
          </>
        )}
        {selectedSubmitted && !selectedLine && (
          <>
            <ActionChip
              label="Prezzo"
              onClick={() => c.openPriceOverride({ kind: "submitted", lineId: selectedSubmitted.lineId })}
            />
            <ActionChip label="Storno" onClick={() => c.requestStorno(selectedSubmitted)} />
          </>
        )}
      </div>
    </div>
  ) : null;

  const footerButtons = (
    <div className="grid grid-cols-4 gap-2">
      <Button
        className="min-h-12 text-sm leading-tight"
        disabled={speditoLines.length === 0 || isOffline || needsLock || shiftInactive}
        title={shiftInactive ? "Turno non attivo" : undefined}
        onClick={c.requestSubmit}
      >
        {orderTargetLabel && isUnionHost(liveTable) ? (
          <>
            <span className="block text-xs font-normal opacity-90">{formatTableLabel(orderTargetLabel)}</span>
            <span>Spedisci</span>
          </>
        ) : (
          "Spedisci"
        )}
      </Button>
      <Button variant="outline" className="min-h-12 text-sm" disabled={isOffline} onClick={handleMarciaClick}>
        {suggestedMarcia != null ? "Marcia ▶" : "Marcia"}
      </Button>
      <Button
        variant="outline"
        className="min-h-12 text-sm"
        disabled={isOffline}
        onClick={() => c.setConfirmPreconto(true)}
      >
        Preconto
      </Button>
      <Button variant="outline" className="min-h-12 px-0 text-lg" onClick={() => setMoreOpen(true)} aria-label="Altre opzioni">
        ≡
      </Button>
    </div>
  );

  const header = (
    <header className="shrink-0 border-b border-[hsl(var(--pg-border))]">
      <div className="flex items-center gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={handleBack}
          className="min-h-10 shrink-0 pr-1 text-sm font-medium text-[hsl(var(--pg-primary))]"
        >
          {backLabel}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold leading-tight">
          {compactMergedTableLabel(liveTable, tables)}
        </h1>
        <p className="shrink-0 text-base font-bold tabular-nums">€{tableTotal.toFixed(2)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 pb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
        <span>{operator.firstName}</span>
        <span aria-hidden>·</span>
        {onEditGuests ? (
          <button
            type="button"
            className="font-medium text-[hsl(var(--pg-primary))] underline-offset-2 hover:underline"
            onClick={onEditGuests}
          >
            {formatUnionGuests(liveTable, tables, { long: true }) || "Imposta coperti"}
          </button>
        ) : (
          <span>{formatUnionGuests(liveTable, tables, { long: true }) || "Coperti non impostati"}</span>
        )}
        {cartCount > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>{cartCount} in bozza</span>
          </>
        )}
      </div>
      {unionTables.length > 1 && (
        <div className="flex items-center gap-2 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/25 px-3 py-2">
          <p className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Aggiungi a
          </p>
          <div className="flex min-w-0 flex-1 gap-1.5">
            {unionTables.map((m) => {
              const selected = m.id === orderTargetId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => c.setOrderForTableId(m.id)}
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
  );

  const banners = (
    <>
      {isOffline && (
        <div className="shrink-0 bg-yellow-500/90 px-3 py-1.5 text-center text-xs font-medium text-black">
          Offline — Spedisci disabilitato
        </div>
      )}
      {shiftInactive && showShiftBanner && <ShiftInactiveBanner />}
    </>
  );

  const lockBanner = needsLock ? (
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
  ) : null;

  const messageBar =
    message && !message.startsWith("Tavoli uniti:") ? (
      <p className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-2 text-sm">{message}</p>
    ) : null;

  const modals = (
    <>
      {moreOpen && (
        <BottomSheet maxHeightClass="max-h-[70dvh]" widthClass="max-w-sm" zClass="z-40" onDismiss={() => setMoreOpen(false)}>
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
                  c.setConfirmReleaseDessert(true);
                }}
              >
                X DOLCE
              </Button>
              <Button
                variant="outline"
                className="min-h-12 w-full justify-start"
                disabled={!selectedLine || needsLock}
                onClick={() => {
                  if (!selectedLine) return;
                  setMoreOpen(false);
                  c.setConfirmDiscountLine(selectedLine.lineId);
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
          onSelect={(course) => {
            setMarciaPicker(false);
            c.setConfirmCallCourse(course);
          }}
          onCancel={() => setMarciaPicker(false)}
        />
      )}

      {noteLine && (
        <NoteModal
          lineName={noteLine.name}
          initialNote={noteLine.notes}
          onSave={(note) => c.saveNote(noteLine.lineId, note)}
          onCancel={() => c.setNoteLineId(null)}
        />
      )}

      {c.variantProduct && (
        <VariantSheet
          product={c.variantProduct}
          variants={variantsForProduct(c.variantProduct, menu.variantGroups ?? [])}
          basePrice={resolvePrice(c.variantProduct, c.channel, menu.prices ?? [])}
          onConfirm={c.confirmVariants}
          onCancel={() => c.setVariantProduct(null)}
        />
      )}

      {editProduct && c.editCartLine && (
        <VariantSheet
          product={editProduct}
          variants={variantsForProduct(editProduct, menu.variantGroups ?? [])}
          basePrice={c.editCartLine.basePrice}
          initialVariants={c.editCartLine.variants}
          confirmLabel="Salva"
          onConfirm={c.stageVariantSave}
          onCancel={() => c.setEditCartLine(null)}
        />
      )}

      {c.pendingVariantSave && c.editCartLine && (
        <ConfirmModal
          title="Salvare le modifiche?"
          message={`Confermi le varianti su «${c.editCartLine.name}»?`}
          confirmLabel="Salva"
          onConfirm={c.applyVariantSave}
          onCancel={() => c.setPendingVariantSave(null)}
        />
      )}

      {exitConfirm && (
        <ConfirmModal
          title="Attenzione!"
          message="Ci sono comande non spedite. Se esci senza spedire, la bozza resta salvata ma il tavolo verrà sbloccato."
          confirmLabel="Esci"
          cancelLabel="Continua ordine"
          onConfirm={() => {
            setExitConfirm(false);
            onLeave();
          }}
          onCancel={() => setExitConfirm(false)}
        />
      )}

      {c.submitConfirm &&
        (() => {
          const { target, toSend } = c.partitionCartForSpedito(cart);
          const n = toSend.reduce((sum, l) => sum + l.quantity, 0);
          const pieces = `${n} ${n === 1 ? "pezzo" : "pezzi"} (€ ${cartTotal(toSend).toFixed(2)})`;
          return (
            <ConfirmModal
              title="Inviare in cucina?"
              message={
                target
                  ? `Spedisci solo per ${formatTableLabel(target.label)}: ${pieces}. Le altre righe restano in bozza (conto unico).`
                  : `Confermi Spedisci per ${pieces}?`
              }
              confirmLabel="Spedisci"
              onConfirm={() => void c.submitOrder()}
              onCancel={() => c.setSubmitConfirm(false)}
            />
          );
        })()}

      {c.confirmCallCourse != null && (
        <ConfirmModal
          title={`Marcia — ${stepLabel(c.confirmCallCourse)}?`}
          message="Sollecito in cucina e sblocco dei piatti in attesa di questa portata."
          confirmLabel="Marcia"
          onConfirm={() => void c.callCourse(c.confirmCallCourse!)}
          onCancel={() => c.setConfirmCallCourse(null)}
        />
      )}

      {c.confirmReleaseDessert && (
        <ConfirmModal
          title="Inviare i dolci?"
          message="I dessert differiti verranno stampati in cucina."
          confirmLabel="X DOLCE"
          onConfirm={() => void c.releaseDessert()}
          onCancel={() => c.setConfirmReleaseDessert(false)}
        />
      )}

      {c.confirmPreconto && (
        <ConfirmModal
          title={precontoCopy.title}
          message={precontoCopy.message}
          confirmLabel="Preconto"
          onConfirm={() => void c.preconto()}
          onCancel={() => c.setConfirmPreconto(false)}
        />
      )}

      {c.confirmStorno && (
        <ConfirmModal
          title="Stornare la riga?"
          message={`Annullare ${c.confirmStorno.name}? Verrà stampato il ticket ANNULLO in cucina.`}
          confirmLabel="Annulla piatto"
          variant="danger"
          onConfirm={() => void c.executeStorno(c.confirmStorno!, 1)}
          onCancel={() => c.setConfirmStorno(null)}
        />
      )}

      {c.stornoQtyTarget && (
        <StornoQtyModal
          itemName={c.stornoQtyTarget.line.name}
          maxQty={c.stornoQtyTarget.maxQty}
          onConfirm={(qty) => void c.executeStorno(c.stornoQtyTarget!.line, qty)}
          onCancel={() => c.setStornoQtyTarget(null)}
        />
      )}

      {c.priceOverrideTarget && (
        <PriceOverrideModal
          itemName={c.priceOverrideTarget.name}
          currentPrice={c.priceOverrideTarget.unitPrice}
          basePrice={c.priceOverrideTarget.basePrice}
          variants={c.priceOverrideTarget.variants}
          onConfirm={(result) => void c.applyPriceOverride(result)}
          onCancel={() => c.setPriceOverrideTarget(null)}
        />
      )}

      {c.confirmDiscountLine && (
        <ConfirmModal
          title="Applicare sconto?"
          message={`Sconto del ${menu.settings?.maxDiscountPercent ?? 20}% sulla riga «${
            cart.find((l) => l.lineId === c.confirmDiscountLine)?.name ?? ""
          }»? Serve il PIN di un responsabile.`}
          confirmLabel="Continua"
          onConfirm={c.startDiscount}
          onCancel={() => c.setConfirmDiscountLine(null)}
        />
      )}

      {c.discountPinLineId && (
        <PinModal
          title="PIN manager per sconto"
          onComplete={(pin) => void c.applyDiscount(pin)}
          onCancel={c.cancelDiscount}
          error={c.discountPinError}
        />
      )}
    </>
  );

  if (isCassa) {
    return (
      <SheetLayoutProvider layout="side">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--pg-background))]">
          {banners}
          {header}
          {lockBanner}
          {messageBar}
          <div className="flex min-h-0 flex-1">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {menuColumn}
              <div className="pointer-events-none absolute inset-x-0 bottom-2">{addedToastEl}</div>
            </div>
            <aside className="flex min-h-0 w-[24rem] shrink-0 flex-col border-l border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/10 xl:w-[28rem]">
              <div className="min-h-0 flex-1 overflow-y-auto">{comandaList}</div>
              {selectionBar}
              <div className="shrink-0 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3">
                {footerButtons}
              </div>
            </aside>
          </div>
          {modals}
        </div>
      </SheetLayoutProvider>
    );
  }

  const footerPad = hasSelection ? "pb-44" : "pb-28";
  const showMenu = c.workspaceTab === "menu";
  const showComanda = c.workspaceTab === "comanda";

  return (
    <SheetLayoutProvider layout="bottom">
      <main className="flex h-screen max-h-screen flex-col overflow-hidden bg-[hsl(var(--pg-background))]">
        {banners}
        {header}
        {lockBanner}
        {messageBar}

        {/* Tab bar — solo portrait / schermi stretti */}
        <nav className="flex shrink-0 gap-1 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-2 tablet-l:hidden">
          <TabButton
            label="Comanda"
            badge={cartCount > 0 ? cartCount : undefined}
            badgePopKey={lastAdded?.seq}
            active={showComanda}
            onClick={() => c.setWorkspaceTab("comanda")}
          />
          <TabButton label="Menu" active={showMenu} onClick={() => c.setWorkspaceTab("menu")} />
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
          <div className={`min-h-0 flex-1 overflow-hidden ${showMenu ? "block" : "hidden"} tablet-l:block`}>
            {menuColumn}
          </div>
        </div>

        {/* Avviso aggiunta + azioni riga selezionata, impilati sopra il footer:
            l'avviso non copre mai la barra azioni, che su telefono va su due righe. */}
        <div className="pointer-events-none fixed bottom-[4.5rem] left-0 right-0 z-20 flex flex-col">
          {addedToastEl}
          {selectionBar}
        </div>

        <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          {footerButtons}
        </footer>

        {modals}
      </main>
    </SheetLayoutProvider>
  );
}

function TabButton({
  label,
  badge,
  badgePopKey,
  active,
  onClick,
}: {
  label: string;
  badge?: number;
  /** Cambia a ogni aggiunta: fa "saltare" il badge. */
  badgePopKey?: number;
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
        <span
          key={badgePopKey}
          className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1 text-xs text-[hsl(var(--pg-primary-foreground))] ${
            badgePopKey ? "pg-pop" : ""
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function ActionChip({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
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
