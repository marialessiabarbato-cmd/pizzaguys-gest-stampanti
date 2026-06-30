import { ORDER_STEPS } from "../lib/course";
import type { CartLine } from "../lib/types";

export function CourseStepBar({
  activeCourse,
  cart,
  disabled,
  onSelect,
}: {
  activeCourse: number;
  cart: CartLine[];
  disabled?: boolean;
  onSelect: (course: number) => void;
}) {
  const countByCourse = (course: number) =>
    cart.filter((l) => l.course === course).reduce((n, l) => n + l.quantity, 0);

  const activeStep = ORDER_STEPS.find((s) => s.course === activeCourse);

  return (
    <div className="shrink-0 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--pg-muted-foreground))]">
          Portata
        </p>
        {activeStep && (
          <p className="truncate text-[10px] text-[hsl(var(--pg-muted-foreground))]">
            {activeStep.hint}
          </p>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {ORDER_STEPS.map((step) => {
          const active = activeCourse === step.course;
          const count = countByCourse(step.course);
          return (
            <button
              key={step.course}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(step.course)}
              className={`relative flex min-h-11 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition disabled:opacity-40 ${
                active
                  ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]"
              }`}
            >
              <span className="text-[10px] font-semibold leading-tight sm:text-xs">{step.shortLabel}</span>
              {count > 0 && (
                <span
                  className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    active
                      ? "bg-[hsl(var(--pg-background))] text-[hsl(var(--pg-primary))]"
                      : "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  }`}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
