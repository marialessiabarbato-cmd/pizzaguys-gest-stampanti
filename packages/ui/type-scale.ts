/**
 * Scala tipografica di palmare e cassa (richiesta cliente: testi più grandi).
 * Ogni classe sale di circa un gradino rispetto al default Tailwind
 * (es. text-sm 14px → 16px); i titoli crescono meno per non rompere le intestazioni.
 * `2xs` sostituisce le dimensioni fisse 9–11px usate per badge ed etichette.
 * KDS e Cloud Admin restano sulla scala Tailwind standard.
 */
export const typeScale = {
  "2xs": ["0.75rem", { lineHeight: "1rem" }], // 12px (prima 9–11px fissi)
  xs: ["0.875rem", { lineHeight: "1.25rem" }], // 14px (prima 12px)
  sm: ["1rem", { lineHeight: "1.5rem" }], // 16px (prima 14px)
  base: ["1.125rem", { lineHeight: "1.75rem" }], // 18px (prima 16px)
  lg: ["1.25rem", { lineHeight: "1.75rem" }], // 20px (prima 18px)
  xl: ["1.375rem", { lineHeight: "1.875rem" }], // 22px (prima 20px)
  "2xl": ["1.625rem", { lineHeight: "2.125rem" }], // 26px (prima 24px)
  "3xl": ["2rem", { lineHeight: "2.375rem" }], // 32px (prima 30px)
  "4xl": ["2.5rem", { lineHeight: "2.75rem" }], // 40px (prima 36px)
} satisfies Record<string, [string, { lineHeight: string }]>;
