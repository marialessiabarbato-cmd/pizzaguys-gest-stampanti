import { randomUUID } from "node:crypto";
import { printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { PrintResult } from "@pizzaguys/hardware-bridge";
import type { PrintFailedPayload, PrintJobKind } from "@pizzaguys/types";
import { broadcast } from "./ws-hub.js";

const KIND_LABELS: Record<PrintJobKind, string> = {
  COMANDA: "Comanda",
  MARCIA: "Marcia",
  DOLCI: "Dolci",
  ANNULLO: "Annullo",
  PRECONTO: "Preconto",
  COPIA_SCONTRINO: "Copia scontrino",
};

/** Traduce gli errori di rete più comuni in un motivo comprensibile per il personale. */
export function friendlyReason(error?: string): string {
  if (!error) return "errore sconosciuto";
  if (/ECONNREFUSED/.test(error)) return "la stampante rifiuta la connessione (spenta o porta errata)";
  if (/Timeout|ETIMEDOUT/i.test(error)) return "nessuna risposta (spenta, cavo scollegato o IP errato)";
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/.test(error)) return "rete non raggiungibile (cavo o IP errato)";
  return error;
}

/**
 * Raccoglie le stampe non riuscite, le notifica a cassa e palmari (PRINT_FAILED)
 * e restituisce un messaggio leggibile per ciascuna, da mostrare a chi ha inviato.
 * In modalità mock le stampe riescono sempre: nessun avviso.
 */
export function reportPrintFailures(
  edgeDb: EdgeDatabase,
  kind: PrintJobKind,
  tableLabel: string,
  results: PrintResult[],
): string[] {
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) return [];

  const printerList = edgeDb.select().from(printers).all();
  const messages = failed.map((r) => {
    const printer = printerList.find((p) => p.id === r.printerId);
    const where = printer ? `${printer.name} (${printer.host}:${printer.port})` : r.printerId;
    return `${KIND_LABELS[kind]} tavolo ${tableLabel} non stampata su ${where}: ${friendlyReason(r.error)}`;
  });

  broadcast({
    type: "PRINT_FAILED",
    payload: { kind, tableLabel, messages } satisfies PrintFailedPayload,
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
  return messages;
}
