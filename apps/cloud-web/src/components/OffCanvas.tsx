"use client";

import { Button } from "@pizzaguys/ui";
import { useEffect, type ReactNode } from "react";

/** Pannello laterale destro (off-canvas) per form admin. */
export function OffCanvas({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = "max-w-md",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Chiudi pannello"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="offcanvas-title"
        className={`relative flex h-full w-full ${widthClassName} flex-col border-l border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] shadow-xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-5 py-4">
          <div className="min-w-0">
            <h2 id="offcanvas-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-[hsl(var(--pg-muted-foreground))]">{description}</p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi">
            ✕
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-[hsl(var(--pg-border))] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
