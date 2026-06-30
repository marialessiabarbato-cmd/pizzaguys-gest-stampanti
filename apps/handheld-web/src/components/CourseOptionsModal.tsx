import { Button } from "@pizzaguys/ui";
import { ALL_ORDER_STEPS } from "../lib/course";

export function CourseOptionsModal({
  title = "Cambia portata",
  currentCourse,
  onSelect,
  onCancel,
}: {
  title?: string;
  currentCourse: number;
  onSelect: (course: number) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        <ul className="space-y-2">
          {ALL_ORDER_STEPS.map((opt) => (
            <li key={opt.course}>
              <button
                type="button"
                onClick={() => onSelect(opt.course)}
                className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left transition ${
                  currentCourse === opt.course
                    ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                    : "border-[hsl(var(--pg-border))] hover:bg-[hsl(var(--pg-muted))]/50"
                }`}
              >
                <div>
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">{opt.hint}</p>
                </div>
                {opt.course >= 2 && currentCourse !== opt.course && (
                  <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">HOLD</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="mt-4 min-h-12 w-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
