import { Button } from "@pizzaguys/ui";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function HeaderMenu({
  label,
  variant = "outline",
  align = "right",
  children,
}: {
  label: string;
  variant?: "outline" | "ghost" | "default";
  align?: "left" | "right";
  children: ReactNode;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant={variant}
        className="h-9 gap-2.5 px-3 text-sm"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span
          className={`inline-flex h-4 w-4 items-center justify-center transition-transform ${
            open
              ? "rotate-180 text-[hsl(var(--pg-primary))]"
              : "text-[hsl(var(--pg-muted-foreground))]"
          }`}
          aria-hidden
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
            <path
              d="M5.5 7.75 10 12.25l4.5-4.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-[calc(100%+4px)] z-50 min-w-[200px] overflow-hidden rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function HeaderMenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-[hsl(var(--pg-muted))]/60 ${
        danger ? "text-red-600" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
