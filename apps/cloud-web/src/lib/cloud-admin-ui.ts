/**
 * Convenzioni UI Cloud Admin — unico punto di riferimento per input, form, link e bottoni.
 * Importare da qui in tutte le pagine e componenti del dashboard.
 */

const inputCore =
  "rounded-md border border-[hsl(var(--pg-border))] bg-transparent text-sm text-[hsl(var(--pg-foreground))] placeholder:text-[hsl(var(--pg-muted-foreground))]";

/** Input standard (36px), affiancato ad azioni inline */
export const inputClass = `h-9 px-3 ${inputCore}`;

/** Input a larghezza piena (form impostazioni, modali) */
export const inputFullClass = `w-full ${inputClass}`;

/** Input compatto (32px), righe di modifica in lista */
export const inputCompactClass = `h-8 px-2 ${inputCore}`;

/** Campo ricerca in toolbar elenchi */
export const searchInputClass = `h-10 flex-1 px-3 ${inputCore}`;

/** Select nativo (stessa altezza degli input) */
export const selectClass = inputClass;

/** Select a larghezza piena con limite */
export const selectFullClass = `w-full max-w-md ${selectClass}`;

/** Select in filtri con larghezza minima */
export const selectFilterClass = `min-w-[200px] ${selectClass}`;

/** Input login (area tocco maggiore) */
export const loginInputClass = `w-full px-3 py-3 ${inputCore}`;

/** Etichetta in riga form con campo sotto */
export const stackedLabelClass = "text-sm";

/** Campo dentro etichetta stacked (mt-1 block) */
export const stackedInputClass = `mt-1 block ${inputClass}`;
export const stackedSelectClass = `mt-1 block ${selectFilterClass}`;

/**
 * Riga form con etichette sopra gli input e pulsante affiancato:
 * allinea in basso (con gli input), non al centro del blocco etichetta+input.
 */
export const formRowEndClass = "flex flex-wrap items-end gap-2";
export const formRowEndGap3Class = "flex flex-wrap items-end gap-3";

/** Riga solo pulsante + messaggio (nessun campo etichettato affiancato) */
export const formActionsClass = "flex flex-wrap items-center gap-3";

/** Griglia form a due colonne */
export const formGridClass = "grid gap-3 md:grid-cols-2";

/** Intestazione pagina con azione in alto a destra */
export const pageHeaderRowClass = "flex flex-wrap items-end justify-between gap-4";

/** Righe lista con campi in modifica: end; in sola lettura: center */
export function listRowClass(editing: boolean) {
  return `flex flex-wrap justify-between gap-2 ${editing ? "items-end" : "items-center"}`;
}

export const backLinkClass =
  "mb-2 inline-block text-sm text-[hsl(var(--pg-primary))] hover:underline";

export const detailLinkClass =
  "text-sm font-medium text-[hsl(var(--pg-primary))] hover:underline";

export const inlineLinkClass = "text-sm text-[hsl(var(--pg-primary))] hover:underline";

/** Taglie Button (@pizzaguys/ui): inline = accanto agli input; list = azioni in tabella */
export const btnSize = {
  inline: "sm",
  list: "compact",
} as const;
