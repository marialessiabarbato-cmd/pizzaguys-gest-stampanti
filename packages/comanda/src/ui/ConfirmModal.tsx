import { Button } from "@pizzaguys/ui";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  variant = "default",
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  /** Azione alternativa facoltativa (es. "Fine turno" accanto a "Esci"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <BottomSheet maxHeightClass="max-h-[70dvh]" zClass="z-[60]">
      <div className="px-4 pb-2 pt-1">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-[hsl(var(--pg-muted-foreground))]">{message}</p>
      </div>
      <div className={bottomSheetFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="outline" className="min-h-12 flex-1" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        <Button
          className="min-h-12 flex-1"
          variant={variant === "danger" ? "danger" : "default"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
