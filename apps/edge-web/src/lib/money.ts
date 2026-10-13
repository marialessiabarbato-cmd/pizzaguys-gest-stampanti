/** "12,50" / "12.5" → 12.5; vuoto o non valido → NaN. */
export function parseEuro(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return Number.NaN;
  return Number.parseFloat(normalized);
}

export function euro(value: number) {
  const sign = value < 0 ? "−" : "";
  return `${sign}€ ${Math.abs(value).toFixed(2).replace(".", ",")}`;
}

/** Valore per un campo di input: 12.5 → "12,50". */
export function euroInput(value: number | null | undefined) {
  return value == null ? "" : value.toFixed(2).replace(".", ",");
}

/** Colore dello scostamento: rosso se manca denaro, arancione se ce n'è in più (US 5.3). */
export function discrepancyClass(value: number) {
  if (value < 0) return "bg-red-500/10 text-red-600";
  if (value > 0) return "bg-orange-500/10 text-orange-600";
  return "bg-green-500/10 text-green-700";
}

export function discrepancyLabel(value: number) {
  if (value < 0) return "Ammanco";
  if (value > 0) return "Eccedenza";
  return "In quadratura";
}
