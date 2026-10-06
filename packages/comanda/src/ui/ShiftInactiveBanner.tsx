/** Avviso fisso quando nessun turno cassa è aperto: invio comande e banco sono bloccati. */
export function ShiftInactiveBanner() {
  return (
    <div
      role="alert"
      className="shrink-0 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-900"
    >
      <strong>Turno non attivo</strong> — la cassa deve avviare il turno. Puoi preparare la
      comanda, ma l'invio è bloccato.
    </div>
  );
}
