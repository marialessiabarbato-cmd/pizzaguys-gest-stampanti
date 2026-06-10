export interface LineVariant {
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

/**
 * Calcola il prezzo finale di una riga applicando varianti.
 * Vincolo fiscale: il prezzo non può scendere a ≤ 0.
 */
export function calculateLinePrice(basePrice: number, variants: LineVariant[]): number {
  const delta = variants.reduce((sum, v) => sum + v.priceDelta, 0);
  return Math.round((basePrice + delta) * 100) / 100;
}

export function isLinePriceValid(basePrice: number, variants: LineVariant[]): boolean {
  return calculateLinePrice(basePrice, variants) > 0;
}
