import { useState } from "react";

export function ComandaHelp({ context = "cart" }: { context?: "cart" | "table" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 text-xs">
      <button
        type="button"
        className="min-h-12 w-full px-3 py-2 text-left font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾" : "▸"} Aiuto comanda
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-[hsl(var(--pg-border))] px-3 py-2 text-[hsl(var(--pg-muted-foreground))]">
          {context === "cart" ? (
            <>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">Portata</strong> — ogni riga
                eredita lo step dalla categoria; puoi sovrascriverlo con Antipasto / Primo / Secondo.
              </li>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">HOLD sul gruppo</strong> — sospende
                tutta la portata fino a CHIAMA PORTATA dalla gestione tavolo.
              </li>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">Tieni premuto</strong> su una riga
                per modificare le varianti.
              </li>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">Sconto %</strong> — oltre la soglia
                serve PIN manager.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">CHIAMA PORTATA</strong> — dalla
                gestione tavolo sblocca in cucina gli step in HOLD.
              </li>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">X DOLCE</strong> — invia i dessert
                differiti a fine pasto.
              </li>
              <li>
                <strong className="text-[hsl(var(--pg-foreground))]">🔒 Righe inviate</strong> — tap
                sulla riga e Storno per annullare (ticket in cucina).
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
