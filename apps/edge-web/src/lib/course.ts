/** Allineato all'API edge (course 1–4) e alla sala handheld. */
export const ORDER_STEPS = [
  { course: 1, label: "Ora", shortLabel: "Ora", callLabel: "Chiama Ora", hint: "Via subito" },
  { course: 2, label: "Segue >1", shortLabel: ">1", callLabel: "Chiama >1", hint: "In attesa" },
  { course: 3, label: "Segue >2", shortLabel: ">2", callLabel: "Chiama >2", hint: "In attesa" },
  { course: 4, label: "Dolce", shortLabel: "Dolce", callLabel: "Chiama Dolce", hint: "Fine pasto" },
] as const;

export function normalizeCourse(course: number): number {
  if (course < 1) return 1;
  if (course > 4) return 4;
  return course;
}

export function isOraCourse(course: number): boolean {
  return normalizeCourse(course) <= 1;
}

export function stepShortLabel(course: number): string {
  const step = ORDER_STEPS.find((s) => s.course === normalizeCourse(course));
  return step?.shortLabel ?? `P${normalizeCourse(course)}`;
}
