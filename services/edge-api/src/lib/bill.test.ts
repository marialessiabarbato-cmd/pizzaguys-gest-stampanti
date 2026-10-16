import { afterEach, describe, expect, it } from "vitest";
import { billLinesForCheck, consolidateTableBill, DISCOUNT_LINE_ID, isCoverLineId } from "./bill.js";
import {
  clearAnalyticSplit,
  clearTableOrders,
  importRuntimeState,
  markOrderSubmitted,
  setTableDiscountAmount,
  startAnalyticSplit,
  updateAnalyticSplit,
  upsertOrder,
} from "./runtime.js";

const TABLE = "t-split";

function seedOrder() {
  const now = new Date().toISOString();
  upsertOrder({
    id: "o1",
    tableId: TABLE,
    operatorId: "op",
    operatorName: "Op",
    channel: "TABLE",
    lines: [
      { id: "l1", productId: "p1", name: "Margherita", quantity: 1, unitPrice: 8, channel: "TABLE" },
      { id: "l2", productId: "p2", name: "Diavola", quantity: 1, unitPrice: 9, channel: "TABLE" },
    ],
    createdAt: now,
    updatedAt: now,
  } as never);
  markOrderSubmitted("o1");
}

afterEach(() => {
  clearAnalyticSplit(TABLE);
  clearTableOrders(TABLE);
  importRuntimeState({});
});

describe("coperto nel conto", () => {
  it("è una riga sola al primo posto senza split", () => {
    seedOrder();
    const bill = consolidateTableBill(TABLE, { guestCount: 3, unitPrice: 2.5 });
    expect(bill.lines[0]).toMatchObject({ name: "Coperto", quantity: 3, lineTotal: 7.5 });
    expect(bill.lines.filter((l) => isCoverLineId(l.id))).toHaveLength(1);
    expect(bill.total).toBe(24.5);
  });

  it("in split analitico è una riga per persona, da assegnare ai conti", () => {
    seedOrder();
    startAnalyticSplit(TABLE, 2);
    let bill = consolidateTableBill(TABLE, { guestCount: 3, unitPrice: 3 });
    const covers = bill.lines.filter((l) => isCoverLineId(l.id));
    expect(covers).toHaveLength(3);
    expect(covers.every((c) => c.quantity === 1 && c.lineTotal === 3)).toBe(true);
    // all'inizio nulla è assegnato, coperti compresi
    expect(bill.analyticSplit?.unassignedLineIds).toHaveLength(5);

    const [c1, c2] = bill.analyticSplit!.checks as unknown as [{ id: string; label: string }, { id: string; label: string }];
    const [cv1, cv2, cv3] = covers as unknown as [{ id: string }, { id: string }, { id: string }];
    updateAnalyticSplit(TABLE, [
      { id: c1.id, label: c1.label, lineIds: ["l1", cv1.id] },
      { id: c2.id, label: c2.label, lineIds: ["l2", cv2.id, cv3.id] },
    ]);
    bill = consolidateTableBill(TABLE, { guestCount: 3, unitPrice: 3 });
    expect(bill.analyticSplit?.allAssigned).toBe(true);
    const totals = bill.analyticSplit!.checks.map((c) => c.total);
    expect(totals).toEqual([11, 15]);
    // la somma dei conti copre l'intero tavolo: niente più buchi
    expect((totals[0] ?? 0) + (totals[1] ?? 0)).toBe(bill.total);
    expect(billLinesForCheck(bill, c2.id).filter((l) => isCoverLineId(l.id))).toHaveLength(2);
  });
});

describe("sconto in euro", () => {
  it("aggiunge la riga Sconto in fondo e riduce il totale", () => {
    seedOrder();
    setTableDiscountAmount(TABLE, 5, "Test Admin");
    const bill = consolidateTableBill(TABLE, { guestCount: 2, unitPrice: 2 });
    const last = bill.lines[bill.lines.length - 1];
    expect(last?.id).toBe(DISCOUNT_LINE_ID);
    expect(last?.lineTotal).toBe(-5);
    expect(bill.total).toBe(16); // 8 + 9 + 4 coperti − 5
    expect(bill.discountAmount).toBe(5);
  });

  it("non supera il totale", () => {
    seedOrder();
    setTableDiscountAmount(TABLE, 100);
    const bill = consolidateTableBill(TABLE);
    expect(bill.total).toBe(0);
  });
});
