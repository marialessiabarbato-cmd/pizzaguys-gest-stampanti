import { randomUUID } from "node:crypto";
import { printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import { CONDITION_MESSAGES, isBlocking, type PrinterStatus } from "@pizzaguys/hardware-bridge";
import type { PrinterHealth, PrinterStatusPayload } from "@pizzaguys/types";
import {
  countPendingByPrinter,
  getKnownStatus,
  readPrinterStatus,
  retryNowForPrinter,
  setKnownStatus,
} from "./print-queue.js";
import { broadcast } from "./ws-hub.js";
import { learnPrinterMac, rediscoverPrinters } from "./printer-discovery.js";

/**
 * Controllo periodico delle stampanti (R3): ogni 30 s legge lo stato di ogni indirizzo
 * (una sola lettura se più reparti usano la stessa stampante). Se qualcosa cambia la cassa
 * riceve PRINTER_STATUS; se una stampante torna pronta i suoi ticket in attesa ripartono subito.
 */

const CHECK_INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

function isSimulated() {
  return (process.env.HARDWARE_BRIDGE_MODE ?? "mock") !== "network";
}

export function getPrinterHealth(edgeDb: EdgeDatabase): PrinterHealth[] {
  const pending = countPendingByPrinter(edgeDb);
  const simulated = isSimulated();
  return edgeDb
    .select()
    .from(printers)
    .all()
    .map((p) => {
      const known = getKnownStatus(p.id);
      const condition = !p.enabled ? "UNKNOWN" : (known?.condition ?? "UNKNOWN");
      const message = !p.enabled
        ? "disattivata"
        : simulated
          ? "stampa simulata (file su disco)"
          : (known?.message ?? "non ancora controllata");
      return {
        printerId: p.id,
        name: p.name,
        workCenter: p.workCenter,
        host: p.host,
        port: p.port,
        condition: simulated && p.enabled ? "OK" : condition,
        message,
        supported: known?.supported ?? false,
        checkedAt: known?.checkedAt ?? "",
        pendingJobs: pending.get(p.id) ?? 0,
      } satisfies PrinterHealth;
    });
}

function broadcastHealth(edgeDb: EdgeDatabase) {
  broadcast({
    type: "PRINTER_STATUS",
    payload: { printers: getPrinterHealth(edgeDb) } satisfies PrinterStatusPayload,
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}

/** Un giro di controlli. Restituisce gli id delle stampanti il cui stato è cambiato. */
export async function checkPrinters(edgeDb: EdgeDatabase): Promise<string[]> {
  if (checking || isSimulated()) return [];
  checking = true;
  const changed: string[] = [];
  try {
    const list = edgeDb.select().from(printers).all().filter((p) => p.enabled);
    const byAddress = new Map<string, typeof list>();
    for (const p of list) {
      const key = `${p.host}:${p.port}`;
      byAddress.set(key, [...(byAddress.get(key) ?? []), p]);
    }
    const unreachable: typeof list = [];
    for (const group of byAddress.values()) {
      const first = group[0]!;
      let status: PrinterStatus;
      try {
        status = await readPrinterStatus(first);
      } catch {
        continue;
      }
      // R3: raggiunta → si segna il MAC; irraggiungibile → candidata alla ricerca in rete
      if (status.condition === "UNREACHABLE") unreachable.push(first);
      else void learnPrinterMac(edgeDb, first).catch(() => undefined);
      for (const p of group) {
        const prevCondition = previous.get(p.id);
        setKnownStatus(p.id, status);
        if (prevCondition !== status.condition) {
          changed.push(p.id);
          const wasDown = prevCondition !== undefined && isBlocking(prevCondition);
          if (wasDown && !isBlocking(status.condition)) retryNowForPrinter(edgeDb, p.id);
        }
        previous.set(p.id, status.condition);
      }
    }
    if (unreachable.length > 0) {
      const moved = await rediscoverPrinters(edgeDb, unreachable).catch(() => []);
      if (moved.length > 0) {
        // Indirizzo aggiornato: si riprova subito e i ticket in attesa ripartono
        for (const m of moved) {
          for (const p of edgeDb.select().from(printers).all().filter((x) => x.host === m.to)) {
            previous.delete(p.id);
            retryNowForPrinter(edgeDb, p.id);
          }
        }
        changed.push("rediscovered");
      }
    }
    if (changed.length > 0) broadcastHealth(edgeDb);
  } finally {
    checking = false;
  }
  return changed;
}

/** Ultima condizione vista dal controllo periodico (per riconoscere i cambi). */
const previous = new Map<string, PrinterStatus["condition"]>();

export function startPrinterMonitor(edgeDb: EdgeDatabase) {
  if (timer) clearInterval(timer);
  if (isSimulated()) return;
  void checkPrinters(edgeDb);
  timer = setInterval(() => void checkPrinters(edgeDb), CHECK_INTERVAL_MS);
  timer.unref?.();
}

export function stopPrinterMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
  previous.clear();
}

export { CONDITION_MESSAGES };
