import { randomUUID } from "node:crypto";
import { printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { PrintResult } from "@pizzaguys/hardware-bridge";
import type { PrintFailedPayload, PrintJobKind } from "@pizzaguys/types";
import { friendlyReason, jobSubject, kindLabel } from "./print-queue.js";
import { broadcast } from "./ws-hub.js";

export { friendlyReason };

/**
 * Raccoglie le stampe non riuscite, le notifica a cassa e palmari (PRINT_FAILED)
 * e restituisce un messaggio leggibile per ciascuna, da mostrare a chi ha inviato.
 * Le stampe dirottate sulla stampante di riserva sono riuscite: le avvisa la coda
 * solo alla cassa (PRINT_NOTICE). In modalità mock le stampe riescono sempre.
 */
export function reportPrintFailures(
  edgeDb: EdgeDatabase,
  kind: PrintJobKind,
  tableLabel: string,
  results: (PrintResult & { willRetry?: boolean })[],
): string[] {
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) return [];

  const printerList = edgeDb.select().from(printers).all();
  const messages = failed.map((r) => {
    const printer = printerList.find((p) => p.id === r.printerId);
    const where = printer ? `${printer.name} (${printer.host}:${printer.port})` : r.printerId;
    const retry = r.willRetry ? " — nuovo tentativo automatico appena la stampante è pronta" : "";
    return `${kindLabel(kind)} ${jobSubject(kind, tableLabel)} non stampata su ${where}: ${friendlyReason(r.error, r.condition)}${retry}`;
  });

  broadcast({
    type: "PRINT_FAILED",
    payload: { kind, tableLabel, messages } satisfies PrintFailedPayload,
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
  return messages;
}
