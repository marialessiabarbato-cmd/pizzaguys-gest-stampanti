import { printQueued } from "./print-queue.js";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { printers } from "@pizzaguys/edge-db";
import { buildPrebillTicket } from "@pizzaguys/escpos";
import { consolidateBillForTable } from "./cover-charge.js";
import { resolveTableContext } from "./counter-order.js";
import { getTableRuntime, setBillRequested } from "./runtime.js";
import { reportPrintFailures } from "./print-alerts.js";
import { broadcastTableStatus } from "./ws-hub.js";


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
      variants: l.variants,
      discountPercent: l.discountPercent,
    })),
    total: bill.total,
    guests: bill.coverCharge?.guestCount ?? getTableRuntime(tableId).guests,
  });

  const printResult = await printQueued(edgeDb, {
    kind: "PRECONTO",
    tableLabel: ctx.label,
    printerId: printer?.id ?? "cassa",
    label: `prebill-${tableId}`,
    payload: payload,
  });

  setBillRequested(tableId);
  broadcastTableStatus(tableId, "BILL_REQUESTED");

  const printWarnings = reportPrintFailures(edgeDb, "PRECONTO", ctx.label, [printResult]);
  return { ok: true as const, bill, printResult, printWarnings };
}
