import { describe, expect, it } from "vitest";
import {
  SALA_AREA,
  clampToArea,
  findFreeSlot,
  isOutsideArea,
  moveItem,
  relocateOutsideTables,
  sortTablesSequential,
} from "./table-layout";

const t = (label: string, sortOrder = 0) => ({ label, sortOrder });

describe("sortTablesSequential", () => {
  it("ordina le etichette in modo naturale", () => {
    const labels = ["T10", "T2", "T1", "Tavolo 11", "tavolo 9", "T3"].map((l) => t(l));
    expect(sortTablesSequential(labels).map((x) => x.label)).toEqual([
      "T1",
      "T2",
      "T3",
      "T10",
      "tavolo 9",
      "Tavolo 11",
    ]);
  });

  it("rispetta l'ordine personalizzato e mette in coda i tavoli senza ordine", () => {
    const rows = [t("T1", 3), t("T2", 1), t("T9"), t("T3", 2), t("T4")];
    expect(sortTablesSequential(rows).map((x) => x.label)).toEqual(["T2", "T3", "T1", "T4", "T9"]);
  });
});

describe("moveItem", () => {
  it("sposta senza mutare la lista originale", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });
});

describe("area della sala", () => {
  const size = { width: 80, height: 80 };

  it("riconosce e riporta dentro i tavoli fuori area", () => {
    expect(isOutsideArea({ x: 1000, y: 10, ...size })).toBe(true);
    expect(isOutsideArea({ x: 10, y: 10, ...size })).toBe(false);
    expect(clampToArea({ x: 1000, y: -30, ...size })).toEqual({ x: SALA_AREA.width - 80, y: 0 });
  });

  it("trova il primo posto libero senza sovrapposizioni", () => {
    expect(findFreeSlot([], size)).toEqual({ x: 20, y: 20 });
    expect(findFreeSlot([{ x: 20, y: 20, ...size }], size)).toEqual({ x: 116, y: 20 });
  });

  it("va a capo quando la riga è piena e resta sempre dentro l'area", () => {
    const occupied = [];
    for (let i = 0; i < 40; i++) {
      const slot = findFreeSlot(occupied, size);
      expect(isOutsideArea({ ...slot, ...size })).toBe(false);
      occupied.push({ ...slot, ...size });
    }
    expect(occupied[9]).toMatchObject({ x: 20, y: 116 });
  });

  it("sposta solo i tavoli fuori area, in posti liberi distinti", () => {
    const tables = [
      { id: "a", x: 20, y: 20, ...size },
      { id: "b", x: 1500, y: 20, ...size },
      { id: "c", x: 20, y: 900, ...size },
    ];
    const moves = relocateOutsideTables(tables);
    expect(moves.map((m) => m.id)).toEqual(["b", "c"]);
    expect(moves[0]).toMatchObject({ x: 116, y: 20 });
    expect(moves[1]).toMatchObject({ x: 212, y: 20 });
  });
});
