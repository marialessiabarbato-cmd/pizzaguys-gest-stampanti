import type { CartLine, Category } from "./types";
import { localized } from "./menu";

/** Allineato all'API edge (course 1–4). Ora = 0/1, Segue = 2+. */
export const MARCHIA_OPTIONS = [
  { course: 1, label: "ORA" },
  { course: 2, label: "SEGUE → 1" },
  { course: 3, label: "SEGUE → 2" },
  { course: 4, label: "SEGUE → 3" },
] as const;

/**
 * Step portata in sala.
 * Ora e Segue sono indipendenti: più piatti possono condividere la stessa portata.
 */
export const ORDER_STEPS = [
  { course: 1, label: "Ora", shortLabel: "Ora", hint: "Via subito in cucina" },
  { course: 2, label: "Segue >1", shortLabel: "Segue >1", hint: "In attesa — indipendente da Ora" },
  { course: 3, label: "Segue >2", shortLabel: "Segue >2", hint: "In attesa" },
  { course: 4, label: "Dolce", shortLabel: "Dolce", hint: "In coda — a fine pasto" },
] as const;

export const ALL_ORDER_STEPS = ORDER_STEPS;

export function marchiaLabel(course: number): string {
  const c = normalizeCourse(course);
  const step = ORDER_STEPS.find((s) => s.course === c);
  if (step) return step.label;
  if (c <= 1) return "Ora";
  return `Segue >${c - 1}`;
}

export function stepLabel(course: number): string {
  return marchiaLabel(course);
}

/** Alias usato da schermate legacy. */
export function courseLabel(course: number): string {
  return stepLabel(course);
}

/** Ora = course 0 o 1; Segue/Dolce = 2–4. */
export function normalizeCourse(course: number): number {
  if (course < 1) return 1;
  if (course > 4) return 4;
  return course;
}

export function isOraCourse(course: number): boolean {
  return normalizeCourse(course) <= 1;
}

export function isSegueCourse(course: number): boolean {
  return normalizeCourse(course) >= 2;
}

export function defaultCourseForCategory(cat: Category): number {
  const n = localized(cat.name).toLowerCase();
  if (n.includes("antipast") || n.includes("bevand") || n.includes("birre") || n.includes("vini")) {
    return 1;
  }
  if (n.includes("dolc")) return 4;
  if (n.includes("second") || n.includes("insalat")) return 3;
  if (
    n.includes("pizz") ||
    n.includes("focac") ||
    n.includes("calzon") ||
    n.includes("panuozz") ||
    n.includes("panin")
  ) {
    return 2;
  }
  return 2;
}

export function suggestedCourseForCategory(cat: Category): number {
  return defaultCourseForCategory(cat);
}

export function defaultHoldForCourse(course: number, category: { hold?: boolean }): boolean {
  if (category.hold) return true;
  return course >= 2;
}

export function groupCartByCourse(cart: CartLine[]): Map<number, CartLine[]> {
  const groups = new Map<number, CartLine[]>();
  for (const line of cart) {
    const course = normalizeCourse(line.course);
    const list = groups.get(course) ?? [];
    list.push(line);
    groups.set(course, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a - b));
}

export function isCourseOnHold(lines: CartLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.hold);
}

/** Portata SEGUE in HOLD da sbloccare con Marcia (la più bassa). */
export function suggestMarciaCourse(cart: CartLine[]): number | null {
  const groups = groupCartByCourse(cart);
  const held = [...groups.entries()]
    .filter(([course, lines]) => course >= 2 && isCourseOnHold(lines))
    .map(([course]) => course)
    .sort((a, b) => a - b);
  return held[0] ?? null;
}
