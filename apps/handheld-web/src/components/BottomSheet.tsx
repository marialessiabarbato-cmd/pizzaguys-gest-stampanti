import { useEffect, useState, type ReactNode } from "react";

/**
 * Spazio occupato in basso dalla tastiera virtuale (0 se chiusa).
 * Su iPad/Android `position: fixed` resta ancorato al layout viewport,
 * quindi senza questo lo sheet finisce sotto la tastiera.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** Sheet ancorato in basso — pattern tablet handheld. */
export function BottomSheet({
  children,
  maxHeightClass = "max-h-[88dvh]",
  zClass = "z-50",
  onDismiss,
}: {
  children: ReactNode;
  maxHeightClass?: string;
  zClass?: string;
  /** Se presente, tap sullo sfondo o Esc chiudono lo sheet. */
  onDismiss?: () => void;
}) {
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className={`fixed inset-0 flex items-end bg-black/40 ${zClass}`}
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      onClick={(e) => {
        if (onDismiss && e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        className={`flex h-auto w-full flex-col overflow-hidden rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl ${maxHeightClass}`}
        // Il 100% è già al netto del padding riservato alla tastiera.
        style={keyboardInset > 0 ? { maxHeight: "calc(100% - 1rem)" } : undefined}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden>
          <div className="h-1.5 w-10 rounded-full bg-[hsl(var(--pg-muted-foreground))]/35" />
        </div>
        {children}
      </div>
    </div>
  );
}

export const bottomSheetFooterClass =
  "flex gap-2 border-t border-[hsl(var(--pg-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]";
