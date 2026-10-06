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
            <strong className="text-[hsl(var(--pg-foreground))]">Ora / Segue / Dolce sopra il menu</strong> —
            portata in cui entrano i piatti che tocchi.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">Ora, &gt;1, &gt;2, Dolce nel carrello</strong> —
            sposta la singola riga in un'altra portata.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">− / +</strong> — cambia la quantità;
            ✕ sull'ultimo pezzo elimina la riga.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">Nota</strong> — testo per la cucina
            (es. ben cotta); esce sulla comanda.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">Modifica</strong> — cambia
            ingredienti/varianti su una riga già nel carrello (prima di SPEDITO).
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">Chiama …</strong> — sollecito in
            cucina e sblocco dei piatti in attesa di quella portata.
          </li>
          <li>
            <strong className="text-[hsl(var(--pg-foreground))]">In attesa</strong> — i piatti in
            Segue &gt;1, Segue &gt;2 e Dolce aspettano in cucina fino a Chiama; quelli in Ora
            partono subito.
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
