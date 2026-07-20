/**
 * Arrotonda all'alto al multiplo di 0,05 € successivo
 * (es. 12,02 → 12,05 · 12,00 resta 12,00 · 12,06 → 12,10).
 */
export function roundToFiveCents(amount: number): number {
  const cents = Math.round(amount * 100);
  if (cents % 5 === 0) return cents / 100;
  return (Math.ceil(cents / 5) * 5) / 100;
}

/** Distribuisce un totale arrotondato in N quote; l'ultima assorbe il residuo. */
export function splitRoundedTotal(total: number, shares: number): number[] {
  const roundedTotal = roundToFiveCents(total);
  const amounts: number[] = [];
  let remainingCents = Math.round(roundedTotal * 100);
  const baseCents = Math.floor(remainingCents / shares);
  for (let i = 0; i < shares - 1; i++) {
    const shareCents = Math.ceil(baseCents / 5) * 5;
    amounts.push(shareCents / 100);
    remainingCents -= shareCents;
  }
  amounts.push(remainingCents / 100);
  return amounts;
}
