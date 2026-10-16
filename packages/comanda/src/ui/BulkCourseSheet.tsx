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

  return (
    <BottomSheet maxHeightClass="max-h-[88dvh]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
        <h2 className="mb-1 text-lg font-semibold">Sposta piatti in un'altra portata</h2>
        <p className="mb-3 text-xs text-[hsl(var(--pg-muted-foreground))]">
          Seleziona i piatti della bozza, poi scegli la portata di destinazione.
        </p>

        <div className="space-y-3">
          {byCourse.map(([course, lines]) => {
            const all = lines.every((l) => selected.has(l.lineId));
            return (
              <section key={course}>
                <button
                  type="button"
                  onClick={() => toggleCourse(lines)}
                  className="mb-1 flex w-full items-center justify-between rounded-lg bg-[hsl(var(--pg-muted))]/70 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide"
                >
                  <span>{stepLabel(course)}</span>
                  <span className="font-medium normal-case tracking-normal text-[hsl(var(--pg-primary))]">
                    {all ? "Deseleziona tutti" : "Seleziona tutti"}
                  </span>
                </button>
                <ul className="space-y-1">
                  {lines.map((l) => (
                    <li key={l.lineId}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0"
                          checked={selected.has(l.lineId)}
                          onChange={() => toggle(l.lineId)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
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
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
          Sposta in
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_ORDER_STEPS.map((opt) => (
            <Button
              key={opt.course}
              type="button"
              variant={target === opt.course ? "default" : "outline"}
              className="min-h-12"
              onClick={() => setTarget(opt.course)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className={bottomSheetFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button
          className="min-h-12 flex-1"
          disabled={selected.size === 0 || target == null}
          onClick={() => target != null && onConfirm([...selected], target)}
        >
          {target == null
            ? "Scegli la portata"
            : `Sposta ${pieces} ${pieces === 1 ? "piatto" : "piatti"} in ${stepLabel(target)}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
