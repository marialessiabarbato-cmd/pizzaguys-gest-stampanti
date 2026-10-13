/**
 * Data contabile in ora locale (YYYY-MM-DD). `toISOString()` usa UTC: d'inverno una chiusura
 * dopo l'una di notte finirebbe sul giorno dopo.
 */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
