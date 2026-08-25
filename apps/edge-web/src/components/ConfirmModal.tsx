import { Button } from "@pizzaguys/ui";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  variant = "default",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <OffCanvas widthClass="max-w-sm" zClass="z-[60]" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-[hsl(var(--pg-muted-foreground))]">{message}</p>
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          className="min-h-12 flex-1"
          variant={variant === "danger" ? "danger" : "default"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </OffCanvas>
  );
}
