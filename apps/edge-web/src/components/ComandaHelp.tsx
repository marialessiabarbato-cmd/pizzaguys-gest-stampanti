import { useState } from "react";

export function ComandaHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 text-xs">
      <button
        type="button"
        className="w-full px-3 py-2 text-left font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾" : "▸"} Aiuto comanda
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-[hsl(var(--pg-border))] px-3 py-2 text-[hsl(var(--pg-muted-foreground))]">
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">P1–P4 nel carrello</strong> — assegna
            la portata alla singola riga.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">P1–P4 in basso</strong> — CHIAMA
            PORTATA: sollecito in cucina e sblocco piatti in HOLD.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">HOLD</strong> — il piatto resta in
            attesa fino a CHIAMA PORTATA.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">%</strong> — sconto sulla riga; oltre
            la soglia serve PIN manager.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">X DOLCE</strong> — invia i dessert
            differiti in cucina a fine pasto.
          </li>
        </ul>
      )}
    </div>
  );
}
