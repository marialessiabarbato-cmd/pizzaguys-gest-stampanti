import { describe, expect, it } from "vitest";
import { roundToFiveCents, splitRoundedTotal } from "./rounding.js";

describe("roundToFiveCents", () => {
  it("arrotonda verso l'alto al 5 centesimi", () => {
    expect(roundToFiveCents(12.02)).toBe(12.05);
    expect(roundToFiveCents(12.07)).toBe(12.1);
    expect(roundToFiveCents(12.08)).toBe(12.1);
    expect(roundToFiveCents(12.03)).toBe(12.05);
    expect(roundToFiveCents(12.0)).toBe(12.0);
    expect(roundToFiveCents(12.05)).toBe(12.05);
  });
});

describe("splitRoundedTotal", () => {
  it("somma delle quote = totale arrotondato", () => {
    const shares = splitRoundedTotal(10.03, 3);
    const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum).toBe(roundToFiveCents(10.03));
    expect(shares).toHaveLength(3);
  });
});
