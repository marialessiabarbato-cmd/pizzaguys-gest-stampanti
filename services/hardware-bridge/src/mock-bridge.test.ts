import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockHardwareBridge } from "./mock-bridge.js";

describe("MockHardwareBridge", () => {
  let printDir = "";

  afterEach(async () => {
    printDir = "";
  });

  it("salva file escpos su disco", async () => {
    printDir = await mkdtemp(join(tmpdir(), "pg-print-"));
    const bridge = new MockHardwareBridge({ printDir });
    const result = await bridge.printEscPos("kitchen", Buffer.from("TEST\n"), "test");
    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    const content = await readFile(result.filePath!, "utf-8");
    expect(content).toContain("TEST");
  });

  it("emette scontrino mock", async () => {
    printDir = await mkdtemp(join(tmpdir(), "pg-print-"));
    const bridge = new MockHardwareBridge({ printDir });
    const result = await bridge.emitReceipt({
      locationId: "loc-1",
      tableId: "T3",
      paymentMethod: "CASH",
      lines: [{ name: "Margherita", quantity: 1, unitPrice: 8, vatRate: 10 }],
      amountReceived: 10,
    });
    expect(result.success).toBe(true);
    expect(result.receipt?.mock).toBe(true);
    expect(result.receipt?.change).toBe(2);
  });
});
