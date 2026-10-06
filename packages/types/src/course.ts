/**
 * Regola unica per la cucina: "Ora" (portata 1) parte subito, le portate Segue
 * (>1, >2, Dolce) restano in HOLD finché il cameriere non fa Marcia / Chiama.
 * Il HOLD non si imposta a mano: dipende solo dalla portata.
 */
export function isHeldCourse(course: number | undefined): boolean {
  return (course ?? 1) >= 2;
}
