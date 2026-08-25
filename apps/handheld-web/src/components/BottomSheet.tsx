import type { ReactNode } from "react";

/** Sheet ancorato in basso — pattern tablet handheld. */
export function BottomSheet({
  children,
  maxHeightClass = "max-h-[88dvh]",
  zClass = "z-50",
}: {
  children: ReactNode;
  maxHeightClass?: string;
  zClass?: string;
}) {
  return (
    <div className={`fixed inset-0 flex items-end bg-black/40 ${zClass}`}>
      <div
        className={`flex h-auto w-full flex-col overflow-hidden rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl ${maxHeightClass}`}
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
