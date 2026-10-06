import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Come si aprono i pannelli della comanda:
 * - "bottom": foglio dal basso (palmare, schermi stretti);
 * - "side": pannello laterale destro (cassa touch ≥ 11").
 * Le app scelgono con <SheetLayoutProvider>; il default è "bottom".
 */
export type SheetLayout = "bottom" | "side";

const SheetLayoutContext = createContext<SheetLayout>("bottom");

export function SheetLayoutProvider({
  layout,
  children,
}: {
  layout: SheetLayout;
  children: ReactNode;
}) {
  return <SheetLayoutContext.Provider value={layout}>{children}</SheetLayoutContext.Provider>;
}

export function useSheetLayout(): SheetLayout {
  return useContext(SheetLayoutContext);
}

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

/** Pannello della comanda: foglio dal basso o pannello laterale secondo il layout. */
export function BottomSheet({
  children,
  maxHeightClass = "max-h-[88dvh]",
  widthClass = "max-w-md",
  zClass = "z-50",
  onDismiss,
}: {
  children: ReactNode;
  /** Altezza massima del foglio dal basso. */
  maxHeightClass?: string;
  /** Larghezza del pannello laterale. */
  widthClass?: string;
  zClass?: string;
  /** Se presente, tap sullo sfondo o Esc chiudono il pannello. */
  onDismiss?: () => void;
}) {
  const layout = useSheetLayout();
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  if (layout === "side") {
    return (
      <div
        className={`fixed inset-0 flex justify-end bg-black/40 ${zClass}`}
        onClick={(e) => {
          if (onDismiss && e.target === e.currentTarget) onDismiss();
        }}
      >
        <aside
          role="dialog"
          aria-modal="true"
          className={`relative flex h-full w-full flex-col overflow-hidden border-l border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] pt-3 shadow-xl ${widthClass}`}
          style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
        >
          {children}
        </aside>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 flex items-end bg-black/40 ${zClass}`}
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      onClick={(e) => {
        if (onDismiss && e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
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
  "mt-auto flex gap-2 border-t border-[hsl(var(--pg-border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]";
