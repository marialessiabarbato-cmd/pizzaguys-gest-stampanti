/** Avviso fisso quando la cassa è chiusa: invio comande e banco sono bloccati. */
export function CashClosedBanner() {
  return (
    <div
      role="alert"
      className="shrink-0 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-900"
    >
      <strong>Cassa chiusa</strong> — l'operatore cassa deve aprire il servizio. Puoi preparare la
      comanda, ma l'invio è bloccato.
    </div>
  );
}
