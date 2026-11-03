import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { ALL_ORDER_STEPS, normalizeCourse, stepLabel } from "../course";
import type { CartLine } from "../types";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

/**
 * Sposta in blocco i piatti della bozza in un'altra portata: si parte dalla portata toccata
 * (tutti i suoi piatti selezionati), si possono aggiungere/togliere piatti, poi "Sposta in …".
 * Solo bozza: i piatti già spediti non si spostano da qui.
 */
export function BulkCourseSheet({
  cart,
  fromCourse,
  onConfirm,
  onCancel,
}: {
  cart: CartLine[];
  fromCourse: number;
  onConfirm: (lineIds: string[], course: number) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(cart.filter((l) => normalizeCourse(l.course) === normalizeCourse(fromCourse)).map((l) => l.lineId)),
  );
  const [target, setTarget] = useState<number | null>(null);

  const byCourse = useMemo(() => {
    const map = new Map<number, CartLine[]>();
    for (const l of cart) {
      const c = normalizeCourse(l.course);
      map.set(c, [...(map.get(c) ?? []), l]);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [cart]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCourse = (lines: CartLine[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = lines.every((l) => next.has(l.lineId));
      for (const l of lines) {
        if (all) next.delete(l.lineId);
        else next.add(l.lineId);
      }
      return next;
    });

  const pieces = cart.filter((l) => selected.has(l.lineId)).reduce((n, l) => n + l.quantity, 0);

  // Portate da cui vengono i piatti scelti: spostarli lì non cambierebbe nulla.
  const selectedCourses = new Set(
    cart.filter((l) => selected.has(l.lineId)).map((l) => normalizeCourse(l.course)),
  );
  const onlyFrom = selectedCourses.size === 1 ? [...selectedCourses][0] : null;

  return (
    <BottomSheet maxHeightClass="max-h-[88dvh]" onDismiss={onCancel}>
      {/* Titolo fisso: resta visibile mentre si scorre l'elenco */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-4 pb-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Sposta piatti</h2>
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">Scegli i piatti, poi la portata.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annulla"
          className="min-h-11 min-w-11 shrink-0 rounded-full text-xl text-[hsl(var(--pg-muted-foreground))]"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {byCourse.map(([course, lines]) => {
          const all = lines.every((l) => selected.has(l.lineId));
          return (
            <section key={course}>
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  {stepLabel(course)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCourse(lines)}
                  className="min-h-9 rounded-lg px-2 text-sm font-medium text-[hsl(var(--pg-primary))]"
                >
                  {all ? "Nessuno" : "Tutti"}
                </button>
              </div>
              <ul className="divide-y divide-[hsl(var(--pg-border))] overflow-hidden rounded-xl border border-[hsl(var(--pg-border))]">
                {lines.map((l) => {
                  const on = selected.has(l.lineId);
                  return (
                    <li key={l.lineId}>
                      <label
                        className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 ${
                          on ? "bg-[hsl(var(--pg-primary))]/5" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0"
                          checked={on}
                          onChange={() => toggle(l.lineId)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">
                            {l.quantity}× {l.name}
                          </span>
                          {l.variants.length > 0 && (
                            <span className="block break-words text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {l.variants.map((v) => (v.type === "REMOVE" ? `−${v.name}` : `+${v.name}`)).join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Destinazione e conferma sempre visibili in fondo */}
      <div className={`${bottomSheetFooterClass} shrink-0 flex-col`}>
        <div className="grid w-full grid-cols-4 gap-1.5" role="radiogroup" aria-label="Sposta in">
          {ALL_ORDER_STEPS.map((opt) => {
            const active = target === opt.course;
            const same = onlyFrom === opt.course;
            return (
              <button
                key={opt.course}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={same}
                onClick={() => setTarget(opt.course)}
                className={`min-h-11 whitespace-nowrap rounded-xl border px-1 text-[13px] font-semibold transition disabled:opacity-30 sm:text-sm ${
                  active
                    ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10 text-[hsl(var(--pg-primary))]"
                    : "border-[hsl(var(--pg-border))]"
                }`}
              >
                {opt.shortLabel}
              </button>
            );
          })}
        </div>
        <Button
          className="min-h-12 w-full"
          disabled={selected.size === 0 || target == null}
          onClick={() => target != null && onConfirm([...selected], target)}
        >
          {selected.size === 0
            ? "Scegli almeno un piatto"
            : target == null
              ? `${pieces} ${pieces === 1 ? "piatto" : "piatti"} · scegli la portata`
              : `Sposta ${pieces} ${pieces === 1 ? "piatto" : "piatti"} in ${stepLabel(target)}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
