import { useEffect, type ReactNode } from "react";

/**
 * Pannello laterale destro per cassa touch (≥11").
 * Sostituisce le bottom sheet da telefono: reach migliore, meno vuoto verticale.
 */
export function OffCanvas({
  children,
  widthClass = "max-w-md",
  zClass = "z-50",
  onClose,
}: {
  children: ReactNode;
  widthClass?: string;
  zClass?: string;
  /** Se passato: click backdrop + Escape chiudono il pannello. */
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className={`fixed inset-0 flex justify-end ${zClass}`}>
      {onClose ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Chiudi pannello"
          onClick={onClose}
        />
      ) : (
        <div className="absolute inset-0 bg-black/40" aria-hidden />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full flex-col border-l border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] shadow-xl ${widthClass}`}
      >
        {children}
      </aside>
    </div>
  );
}

export const offCanvasFooterClass =
  "flex gap-2 border-t border-[hsl(var(--pg-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]";
