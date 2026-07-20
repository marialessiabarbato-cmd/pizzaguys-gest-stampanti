import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { printers } from "@pizzaguys/edge-db";
import { buildPrebillTicket } from "@pizzaguys/escpos";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { consolidateBillForTable } from "./cover-charge.js";
import { resolveTableContext } from "./counter-order.js";
import { setBillRequested } from "./runtime.js";
import { broadcastTableStatus } from "./ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

export async function printTablePrebill(edgeDb: EdgeDatabase, tableId: string) {
  const ctx = resolveTableContext(tableId, edgeDb);
  if (!ctx) return { ok: false as const, error: "Tavolo non trovato" };

  const bill = consolidateBillForTable(edgeDb, tableId);
  if (bill.lines.length === 0) {
    return { ok: false as const, error: "Nessuna voce da stampare" };
  }

  const printer =
    edgeDb.select().from(printers).all().find((p) => p.enabled && p.workCenter === "BAR") ??
    edgeDb.select().from(printers).all().find((p) => p.enabled);

  const payload = buildPrebillTicket({
    tableLabel: ctx.label,
    lines: bill.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    total: bill.total,
  });

  const printResult = await hardware.printEscPos(
    printer?.id ?? "cassa",
    payload,
    `prebill-${tableId}`,
  );

  setBillRequested(tableId);
  broadcastTableStatus(tableId, "BILL_REQUESTED");

  return { ok: true as const, bill, printResult };
}
