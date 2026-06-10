import type { VatRate } from "@pizzaguys/types";

export const VAT_RATES: VatRate[] = [4, 10, 22];

export function calculateVatAmount(gross: number, rate: VatRate): number {
  const net = gross / (1 + rate / 100);
  return Math.round((gross - net) * 100) / 100;
}

export function calculateNetAmount(gross: number, rate: VatRate): number {
  return Math.round((gross / (1 + rate / 100)) * 100) / 100;
}
