import multicastDns from "multicast-dns";
import { lanAddresses } from "./network-status.js";

/**
 * Nome fisso della cassa in rete locale (piano rete R3, indirizzo Edge che cambia).
 *
 * Senza IP fisso il router può dare al PC cassa un indirizzo diverso a ogni riaccensione:
 * i palmari e i KDS, che aprono le pagine dal PC cassa, non lo troverebbero più. L'Edge
 * risponde quindi al nome `pizzaguys-cassa.local` (mDNS, come le stampanti e le Apple TV):
 * i dispositivi si collegano a http://pizzaguys-cassa.local:5174 e seguono il PC qualunque
 * indirizzo abbia. L'indirizzo numerico resta valido come riserva.
 *
 * EDGE_MDNS_NAME cambia il nome (es. "pizzaguys-caserta"); "off" lo disattiva. Senza la
 * variabile: pizzaguys-cassa nell'app Windows (NODE_ENV=production), pizzaguys-dev in sviluppo.
 */

let instance: ReturnType<typeof multicastDns> | null = null;
let publishedName: string | null = null;

export function mdnsHostname(): string | null {
  return publishedName;
}

export function configuredMdnsName(): string | null {
  // In sviluppo (Mac) un nome diverso: se Mac e PC del locale sono sulla stessa rete
  // non devono rispondere entrambi a pizzaguys-cassa.local
  const fallback = process.env.NODE_ENV === "production" ? "pizzaguys-cassa" : "pizzaguys-dev";
  const raw = (process.env.EDGE_MDNS_NAME ?? fallback).trim().toLowerCase();
  if (!raw || raw === "off") return null;
  const name = raw.replace(/\.local\.?$/, "").replace(/[^a-z0-9-]/g, "-");
  return `${name}.local`;
}

function answers(name: string) {
  return lanAddresses().map((ip) => ({ name, type: "A" as const, ttl: 120, data: ip }));
}

export function startMdns(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }) {
  const name = configuredMdnsName();
  if (!name || instance) return;
  try {
    instance = multicastDns();
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : err }, "mDNS non avviato");
    return;
  }
  publishedName = name;
  instance.on("error", (err) => log.warn({ err: err.message }, "mDNS: errore"));
  instance.on("query", (query) => {
    const asked = query.questions.some(
      (q) => q.name.toLowerCase() === name && (q.type === "A" || (q.type as string) === "ANY"),
    );
    if (!asked) return;
    const list = answers(name);
    if (list.length > 0) instance?.respond({ answers: list });
  });
  // Annuncio all'avvio: chi ha in memoria un indirizzo vecchio lo aggiorna subito
  const list = answers(name);
  if (list.length > 0) instance.respond({ answers: list });
  log.info({ name, addresses: list.map((a) => a.data) }, "mDNS: cassa raggiungibile per nome");
}

export function stopMdns() {
  instance?.destroy();
  instance = null;
  publishedName = null;
}
