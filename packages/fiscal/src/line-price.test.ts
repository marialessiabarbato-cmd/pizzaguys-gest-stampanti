import { describe, expect, it } from "vitest";
import { calculateLinePrice, isLinePriceValid } from "./line-price.js";

describe("line price validation", () => {
  it("calcola aggiunte correttamente", () => {
    expect(
      calculateLinePrice(10, [{ type: "ADD", priceDelta: 1.5 }]),
    ).toBe(11.5);
  });

  it("rifiuta prezzo zero o negativo", () => {
    expect(
      isLinePriceValid(5, [{ type: "REMOVE", priceDelta: -5 }]),
    ).toBe(false);
  });
});
