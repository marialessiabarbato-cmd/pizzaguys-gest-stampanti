import { describe, expect, it } from "vitest";
import { buildCallCourseTicket, buildKitchenTicket, kitchenTicketPreview } from "./templates.js";

describe("kitchen ticket", () => {
  it("genera buffer non vuoto", () => {
    const buf = buildKitchenTicket({
      workCenter: "Pizzeria",
      tableLabel: "T3",
      guests: 4,
      operatorName: "Mario",
      lines: [{ name: "Margherita", quantity: 2 }],
    });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("include etichetta ristampa", () => {
    const preview = kitchenTicketPreview({
      workCenter: "Cucina",
      tableLabel: "T1",
      guests: 2,
      operatorName: "Luigi",
      lines: [{ name: "Patatine", quantity: 1 }],
      reprint: true,
    });
    expect(preview).toContain("RISTAMPA");
  });
});

describe("call course ticket", () => {
  it("include intestazione portata", () => {
    const buf = buildCallCourseTicket({
      course: 2,
      tableLabel: "T5",
      guests: 4,
      lines: [{ name: "Carbonara", quantity: 1 }],
    });
    const text = buf.toString("utf-8");
    expect(text).toContain("CHIAMA PORTATA 2");
    expect(text).toContain("SEGUE");
  });
});
