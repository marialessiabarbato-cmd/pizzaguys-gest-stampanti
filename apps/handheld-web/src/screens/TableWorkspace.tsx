import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { CourseOptionsModal } from "../components/CourseOptionsModal";
import { CourseStepBar } from "../components/CourseStepBar";
import { MenuPanel } from "../components/MenuPanel";
import { NoteModal } from "../components/NoteModal";
import { VariantSheet } from "../components/VariantSheet";
import {
  groupCartByCourse,
  isCourseOnHold,
  normalizeCourse,
  stepLabel,
  suggestMarciaCourse,
} from "../lib/course";
import { cartTotal, resolvePrice, variantsForProduct } from "../lib/menu";
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

export function TableWorkspace({
  table,
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
  onEditLine,
  onSaveNote,
  onCancelNote,
  onAcquireLock,
}: {
  table: LiveTable;
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
  onEditLine: (line: CartLine) => void;
  onSaveNote: (lineId: string, note: string) => void;
  onCancelNote: () => void;
  onAcquireLock: () => void;
}) {
  const [courseModalLineId, setCourseModalLineId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [marciaPicker, setMarciaPicker] = useState(false);
  const [editConfirm, setEditConfirm] = useState<EditConfirm | null>(null);

  const selectedLine = cart.find((l) => l.lineId === selectedLineId) ?? null;
  const selectedSubmitted =
    submittedLines.find((l) => l.lineId === selectedSubmittedId) ?? null;
  const noteLine = cart.find((l) => l.lineId === noteLineId) ?? null;
  const draftTotal = cartTotal(cart);
  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const groups = groupCartByCourse(cart);
  const suggestedMarcia = suggestMarciaCourse(cart);
  const needsLock = !hasLock && table.status !== "FREE";
  const hasSelection = !!selectedLine || !!selectedSubmitted;

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
    onUpdateCart((prev) =>
      prev.map((l) =>
        l.lineId === lineId ? { ...l, course: c, hold: c >= 2 ? l.hold : false } : l,
      ),
    );
    setCourseModalLineId(null);
  };

  const applyHold = (course: number, enable: boolean) => {
    onUpdateCart((prev) =>
      prev.map((l) => (l.course === course ? { ...l, hold: enable } : l)),
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
  const footerPad = hasSelection ? "pb-36" : "pb-28";
  const confirmCopy = editConfirm ? editConfirmCopy(editConfirm) : null;

  return (
    <main className="flex h-screen max-h-screen flex-col overflow-hidden bg-[hsl(var(--pg-background))]">
      {isOffline && (
        <div className="shrink-0 bg-yellow-500/90 px-3 py-1.5 text-center text-xs font-medium text-black">
          Offline — SPEDITO disabilitato
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLeaveTable}
            className="shrink-0 text-sm font-medium text-[hsl(var(--pg-primary))]"
          >
            ← Tavoli
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{table.label}</h1>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {operator.firstName} · {table.guests ?? table.defaultGuests} coperti
              {cartCount > 0 && ` · ${cartCount} in bozza`}
            </p>
          </div>
          <p className="shrink-0 text-right text-lg font-bold tabular-nums">€{draftTotal.toFixed(2)}</p>
        </div>
      </header>

      {needsLock && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="text-amber-900">Acquisisci il tavolo per modificare</span>
          <Button className="min-h-9 shrink-0" onClick={onAcquireLock}>
            Prendi
          </Button>
        </div>
      )}

      {message && (
        <p className="shrink-0 border-b border-[hsl(var(--pg-border))] px-3 py-2 text-sm">{message}</p>
      )}

      {/* Tab bar */}
      <nav className="flex shrink-0 gap-2 border-b border-[hsl(var(--pg-border))] p-2">
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

      <CourseStepBar
        activeCourse={activeCourse}
        cart={cart}
        disabled={needsLock}
        onSelect={onActiveCourseChange}
      />

      {/* Contenuto scrollabile */}
      <div className={`min-h-0 flex-1 overflow-y-auto ${footerPad}`}>
        {workspaceTab === "menu" ? (
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
        ) : (
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
                    return (
                      <li key={l.lineId}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSubmitted(active ? null : l.lineId);
                            onSelectLine(null);
                          }}
                          className={`flex min-h-14 w-full items-center rounded-xl border px-4 text-left text-sm ${
                            active
                              ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                              : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30"
                          }`}
                        >
                          <span className="mr-2 opacity-50">🔒</span>
                          {remaining}× {l.name}
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
                <Button className="mt-4 min-h-12 w-full max-w-xs" onClick={() => onTabChange("menu")}>
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
                        course <= 1
                          ? "bg-amber-500/12 text-amber-900"
                          : "bg-[hsl(var(--pg-muted))]/80"
                      }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider">
                        {stepLabel(course)}
                      </span>
                      {course >= 2 && (
                        <button
                          type="button"
                          onClick={() => requestHoldToggle(course)}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
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
                        return (
                          <li key={l.lineId}>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectLine(active ? null : l.lineId);
                                onSelectSubmitted(null);
                              }}
                              className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left ${
                                active
                                  ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                                  : "border-[hsl(var(--pg-border))]"
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <p className="font-medium">
                                  {l.quantity}× {l.name}
                                </p>
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
                              </div>
                              <span className="shrink-0 font-semibold tabular-nums">
                                €{lineTotal(l).toFixed(2)}
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
        )}
      </div>

      {/* Azioni riga selezionata */}
      {hasSelection && (
        <div className="fixed bottom-[4.5rem] left-0 right-0 z-20 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]/95 px-3 py-2 backdrop-blur-sm">
          <div className="flex justify-center gap-2">
            {selectedLine && (
              <>
                <ActionChip label="−" disabled={needsLock} onClick={() => requestQtyChange(-1)} />
                <ActionChip label="+" disabled={needsLock} onClick={() => requestQtyChange(1)} />
                <ActionChip
                  label="Nota"
                  disabled={needsLock}
                  onClick={() => onEditLine(selectedLine)}
                />
                <ActionChip
                  label="Portata"
                  disabled={needsLock}
                  onClick={() => setCourseModalLineId(selectedLine.lineId)}
                />
                <ActionChip label="Elimina" disabled={needsLock} onClick={requestDelete} />
              </>
            )}
            {selectedSubmitted && !selectedLine && (
              <ActionChip label="Storno" onClick={() => onStorno(selectedSubmitted)} />
            )}
          </div>
        </div>
      )}

      {/* Footer fisso */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-4 gap-2">
          <Button
            className="min-h-12 text-sm"
            disabled={cart.length === 0 || isOffline || needsLock}
            onClick={onSpedisci}
          >
            Spedisci
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
        <div className="fixed inset-0 z-40 flex items-end bg-black/30">
          <div className="w-full rounded-t-2xl bg-[hsl(var(--pg-background))] p-4 shadow-xl">
            <h3 className="mb-3 font-semibold">Altre opzioni</h3>
            <div className="space-y-2">
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
            <Button variant="ghost" className="mt-3 w-full min-h-12" onClick={() => setMoreOpen(false)}>
              Chiudi
            </Button>
          </div>
        </div>
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
      className={`relative min-h-12 flex-1 rounded-xl text-sm font-semibold transition ${
        active
          ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
          : "bg-[hsl(var(--pg-muted))]/60"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1 text-xs">
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
      className="min-h-11 flex-1 rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/40 text-sm font-medium disabled:opacity-30"
    >
      {label}
    </button>
  );
}
