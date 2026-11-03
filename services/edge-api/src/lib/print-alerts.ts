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
  // Stesso motivo e stesso indirizzo (es. una sola stampante per tutti i reparti, spenta):
  // un messaggio solo con l'elenco dei reparti, invece di uno per ticket.
  const groups = new Map<string, { names: string[]; address: string; reason: string; retry: boolean }>();
  for (const r of failed) {
    const printer = printerList.find((p) => p.id === r.printerId);
    const address = printer ? `${printer.host}:${printer.port}` : "";
    const reason = friendlyReason(r.error, r.condition);
    const key = `${address}|${reason}|${r.willRetry ? 1 : 0}`;
    const g = groups.get(key) ?? { names: [], address, reason, retry: !!r.willRetry };
    const name = printer?.name ?? r.printerId;
    if (!g.names.includes(name)) g.names.push(name);
    groups.set(key, g);
  }
  const messages = [...groups.values()].map((g) => {
    const where = `${g.names.join(", ")}${g.address ? ` (${g.address})` : ""}`;
    const retry = g.retry ? ". Nuovo tentativo automatico appena la stampante è pronta" : "";
    return `${kindLabel(kind)} ${jobSubject(kind, tableLabel)} non stampata su ${where}: ${g.reason}${retry}`;
  });

  broadcast({
    type: "PRINT_FAILED",
    payload: { kind, tableLabel, messages } satisfies PrintFailedPayload,
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
  return messages;
}
