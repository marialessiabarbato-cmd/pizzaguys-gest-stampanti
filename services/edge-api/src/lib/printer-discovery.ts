import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import { and, eq } from "drizzle-orm";
import { lanAddresses } from "./network-status.js";
import { broadcast } from "./ws-hub.js";

/**
 * Stampanti che cambiano indirizzo (piano rete R3, parte 2).
 *
 * Senza IP fisso il router può dare alla stampante un indirizzo nuovo dopo un riavvio.
 * L'Edge si segna l'indirizzo MAC di ogni stampante (fisso, stampato sull'etichetta) quando
 * la raggiunge; se un giorno non risponde più, cerca sulla rete locale chi ha la porta 9100
 * aperta, confronta i MAC e, se la ritrova, aggiorna da solo l'indirizzo di tutti i reparti
 * che la usano. La cassa riceve l'avviso.
 *
 * PRINTER_DISCOVERY=off disattiva la ricerca.
 */

export function discoveryEnabled() {
  return (
    (process.env.HARDWARE_BRIDGE_MODE ?? "mock") === "network" &&
    (process.env.PRINTER_DISCOVERY ?? "on").toLowerCase() !== "off"
  );
}

// ── MAC ─────────────────────────────────────────────────────────────────────

/** "0:1a:2b:3c:4d:5e" / "00-1A-2B-3C-4D-5E" → "00:1a:2b:3c:4d:5e" */
export function normalizeMac(raw: string): string | null {
  const parts = raw.trim().toLowerCase().split(/[:-]/);
  if (parts.length !== 6 || parts.some((p) => !/^[0-9a-f]{1,2}$/.test(p))) return null;
  const mac = parts.map((p) => p.padStart(2, "0")).join(":");
  if (mac === "00:00:00:00:00:00" || mac === "ff:ff:ff:ff:ff:ff") return null;
  return mac;
}

/**
 * Legge la tabella ARP (IP → MAC dei dispositivi contattati di recente) da `arp -a`
 * (Windows, macOS) o da /proc/net/arp (Linux).
 */
export function parseArpTable(text: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const ip = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)?.[1];
    const macRaw = line.match(/\b([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})\b/)?.[1];
    if (!ip || !macRaw) continue;
    const mac = normalizeMac(macRaw);
    if (mac) table.set(ip, mac);
  }
  return table;
}

export async function readArpTable(): Promise<Map<string, string>> {
  if (process.platform === "linux") {
    try {
      return parseArpTable(await readFile("/proc/net/arp", "utf8"));
    } catch {
      /* si prova con arp */
    }
  }
  return new Promise((resolve) => {
    execFile("arp", ["-a"], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      resolve(err ? new Map() : parseArpTable(stdout));
    });
  });
}

// ── Ricerca sulla rete ──────────────────────────────────────────────────────

function probe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("error", () => done(false));
    s.connect(port, host, () => done(true));
  });
}

/** Indirizzi della stessa rete /24 del PC cassa con la porta indicata aperta. */
export async function scanSubnets(port: number, timeoutMs = 400, concurrency = 64): Promise<string[]> {
  const bases = new Set(
    lanAddresses()
      .filter((ip) => /^(10|172|192)\./.test(ip))
      .map((ip) => ip.split(".").slice(0, 3).join(".")),
  );
  const own = new Set(lanAddresses());
  const targets: string[] = [];
  for (const base of bases) {
    for (let i = 1; i <= 254; i++) {
      const ip = `${base}.${i}`;
      if (!own.has(ip)) targets.push(ip);
    }
  }
  const found: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const ip = targets[next++]!;
      if (await probe(ip, port, timeoutMs)) found.push(ip);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return found;
}

// ── Memoria del MAC e ritrovamento ──────────────────────────────────────────

type PrinterRow = typeof printers.$inferSelect;
const lastLearn = new Map<string, number>();
const LEARN_EVERY_MS = 10 * 60_000;

/** Dopo un contatto riuscito: segna (o aggiorna) il MAC della stampante. */
export async function learnPrinterMac(db: EdgeDatabase, printer: PrinterRow, arp?: Map<string, string>) {
  if (!discoveryEnabled()) return;
  const key = `${printer.host}`;
  if (Date.now() - (lastLearn.get(key) ?? 0) < LEARN_EVERY_MS && printer.macAddress) return;
  lastLearn.set(key, Date.now());
  const table = arp ?? (await readArpTable());
  const mac = table.get(printer.host);
  if (!mac || mac === printer.macAddress) return;
  // Stesso indirizzo = stessa stampante fisica: vale per tutti i reparti che la usano
  db.update(printers).set({ macAddress: mac }).where(eq(printers.host, printer.host)).run();
}

let lastScan = 0;
const SCAN_EVERY_MS = 2 * 60_000;

export interface RediscoveryResult {
  printerName: string;
  from: string;
  to: string;
}

/**
 * Stampanti irraggiungibili con MAC noto: cerca sulla rete e, se le ritrova a un altro
 * indirizzo, aggiorna tutti i reparti che le usavano. Al massimo una ricerca ogni 2 minuti.
 */
export async function rediscoverPrinters(
  db: EdgeDatabase,
  unreachable: PrinterRow[],
  deps: { scan?: typeof scanSubnets; arp?: typeof readArpTable; now?: number } = {},
): Promise<RediscoveryResult[]> {
  if (!discoveryEnabled() && !deps.scan) return [];
  const withMac = unreachable.filter((p) => p.macAddress);
  if (withMac.length === 0) return [];
  const now = deps.now ?? Date.now();
  if (now - lastScan < SCAN_EVERY_MS) return [];
  lastScan = now;

  const ports = [...new Set(withMac.map((p) => p.port))];
  const open = new Set<string>();
  for (const port of ports) for (const ip of await (deps.scan ?? scanSubnets)(port)) open.add(ip);
  if (open.size === 0) return [];
  // La ricerca ha appena contattato tutti: la tabella ARP ora ha anche i MAC delle stampanti
  const arp = await (deps.arp ?? readArpTable)();

  const results: RediscoveryResult[] = [];
  const moved = new Set<string>();
  for (const p of withMac) {
    const oldAddress = `${p.host}:${p.port}`;
    if (moved.has(oldAddress)) continue;
    const newHost = [...arp.entries()].find(([ip, mac]) => mac === p.macAddress && open.has(ip))?.[0];
    if (!newHost || newHost === p.host) continue;
    db.update(printers)
      .set({ host: newHost })
      .where(and(eq(printers.host, p.host), eq(printers.port, p.port)))
      .run();
    moved.add(oldAddress);
    results.push({ printerName: p.name, from: p.host, to: newHost });
    broadcast({
      type: "PRINT_NOTICE",
      payload: {
        level: "info",
        event: "RECOVERED",
        jobId: "",
        kind: "TEST",
        tableLabel: "",
        message: `Stampante ${p.name} ritrovata: l'indirizzo è cambiato da ${p.host} a ${newHost} (aggiornato da solo)`,
      },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });
  }
  return results;
}

/** Solo per i test. */
export function resetDiscoveryForTest() {
  lastScan = 0;
  lastLearn.clear();
}
