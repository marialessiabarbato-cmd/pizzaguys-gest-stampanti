import { hostname, networkInterfaces } from "node:os";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { getCloudStatus, getSyncQueueSummary } from "./cloud-status.js";
import { listDevices, pairingRequired } from "./device-auth.js";
import { getPrinterHealth } from "./printer-monitor.js";
import { listConnectedDevices } from "./ws-hub.js";
import { mdnsHostname } from "./mdns.js";

/**
 * Centro stato rete (piano rete R4): una voce per ogni pezzo del locale (Edge, Cloud, RT,
 * stampanti, palmari, KDS, coda, sicurezza), ognuna con semaforo, messaggio e cosa fare.
 * Pensato perché il personale capisca da solo cosa non va, senza chiamare l'assistenza.
 */

export type NetLevel = "ok" | "info" | "warning" | "error";
export type NetGroup = "edge" | "cloud" | "fiscal" | "printer" | "device" | "security";

export interface NetItem {
  id: string;
  group: NetGroup;
  label: string;
  level: NetLevel;
  message: string;
  /** Cosa fare, in parole semplici (assente se è tutto a posto). */
  action?: string;
}

export interface NetworkStatus {
  checkedAt: string;
  overall: NetLevel;
  /** Indirizzi di rete del PC dell'Edge: servono per collegare palmari e KDS. */
  addresses: string[];
  hostname: string;
  /** Nome fisso in rete locale (es. pizzaguys-cassa.local), null se disattivato. */
  mdnsName: string | null;
  /** Build delle app in uso sul PC della cassa: i device con un'altra build vanno ricaricati. */
  referenceBuild: string | null;
  items: NetItem[];
}

const RANK: Record<NetLevel, number> = { ok: 0, info: 1, warning: 2, error: 3 };

export function worstLevel(levels: NetLevel[]): NetLevel {
  return levels.reduce<NetLevel>((w, l) => (RANK[l] > RANK[w] ? l : w), "ok");
}

const startedAt = Date.now();

/** Indirizzi IPv4 di rete locale (niente loopback né interfacce virtuali note). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|utun|awdl|llw|vbox|vmnet)/i.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "mai";
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "meno di un minuto fa";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "giorno" : "giorni"} fa`;
}

/** "handheld@0.1.5+abc1234" → "0.1.5+abc1234"; le versioni vecchie senza "@" restano come sono. */
export function buildOf(clientVersion: string | null | undefined): string | null {
  if (!clientVersion) return null;
  const at = clientVersion.indexOf("@");
  return at >= 0 ? clientVersion.slice(at + 1) : null;
}

const KIND_LABEL: Record<string, string> = { handheld: "Palmare", kds: "KDS", cassa: "Cassa" };
const DEVICE_ARTICLE: Record<string, string> = { handheld: "il palmare", kds: "il KDS", cassa: "il tablet cassa" };

const PRINTER_ACTIONS: Record<string, string> = {
  PAPER_OUT: "Cambia il rotolo: i ticket in attesa escono da soli.",
  PAPER_NEAR_END: "Prepara un rotolo nuovo.",
  COVER_OPEN: "Chiudi bene il coperchio: i ticket in attesa escono da soli.",
  ERROR: "Spegni e riaccendi la stampante; se resta in errore controlla la taglierina.",
  UNREACHABLE:
    "Controlla che sia accesa e che il cavo di rete sia inserito. Se ha cambiato indirizzo, aggiornalo in Impostazioni → Stampanti.",
};

export function buildNetworkStatus(db: EdgeDatabase, now = Date.now()): NetworkStatus {
  const items: NetItem[] = [];
  const addresses = lanAddresses();
  const simulatedPrint = (process.env.HARDWARE_BRIDGE_MODE ?? "mock") !== "network";

  // ── Edge ──
  const upMin = Math.round((now - startedAt) / 60000);
  items.push({
    id: "edge",
    group: "edge",
    label: "Cassa (Edge)",
    level: addresses.length > 0 ? "ok" : "warning",
    message:
      addresses.length > 0
        ? `Attiva da ${upMin < 60 ? `${upMin} min` : `${Math.round(upMin / 60)} ore`} · indirizzo ${addresses.join(", ")}${mdnsHostname() ? ` · nome ${mdnsHostname()}` : ""}`
        : "Attiva, ma senza indirizzo di rete: palmari e KDS non possono collegarsi",
    action:
      addresses.length > 0
        ? undefined
        : "Controlla il cavo di rete o il Wi-Fi del PC cassa.",
  });

  // ── Cloud ──
  const cloud = getCloudStatus(now);
  const cloudLevel: NetLevel =
    cloud.level === "critical" ? "error" : cloud.level === "warning" ? "warning" : cloud.level === "info" ? "info" : "ok";
  items.push({
    id: "cloud",
    group: "cloud",
    label: "Cloud",
    level: cloud.state === "UNKNOWN" ? "info" : cloudLevel,
    message:
      cloud.state === "OK"
        ? `Collegato · ultimo contatto ${ago(cloud.lastOkAt, now)}`
        : cloud.state === "UNKNOWN"
          ? "Nessun contatto ancora (si collega entro un minuto dall'avvio)"
          : (cloud.message ?? `Non raggiungibile da ${ago(cloud.failingSince, now)}`),
    action:
      cloud.state === "UNAUTHORIZED"
        ? "Il token della sede è stato cambiato: l'Admin deve usare «Ricollega ora»."
        : cloud.state === "OK" || cloud.state === "UNKNOWN"
          ? undefined
          : "Il servizio continua normalmente. Controlla il router e la linea internet.",
  });

  const sync = getSyncQueueSummary(db);
  const oldestMin = sync.oldestPendingAt ? (now - Date.parse(sync.oldestPendingAt)) / 60000 : 0;
  items.push({
    id: "sync",
    group: "cloud",
    label: "Invii al Cloud in coda",
    level: sync.pending === 0 ? "ok" : oldestMin > 120 ? "warning" : "info",
    message:
      sync.pending === 0
        ? "Nessun invio in attesa"
        : `${sync.pending} in attesa · il più vecchio ${ago(sync.oldestPendingAt, now)}${sync.lastError ? ` · ultimo errore: ${sync.lastError}` : ""}`,
    action:
      sync.pending > 0 && oldestMin > 120
        ? "Nulla va perso (conservati 30 giorni): partono da soli quando il Cloud torna raggiungibile."
        : undefined,
  });

  // ── Cassa fiscale ──
  items.push({
    id: "rt",
    group: "fiscal",
    label: "Registratore telematico (RT)",
    level: "info",
    message: "Non collegato: gli scontrini sono simulati e non hanno valore fiscale",
    action: "Si collega quando sarà scelto il modello di RT.",
  });

  // ── Stampanti ──
  for (const p of getPrinterHealth(db)) {
    if (p.message === "disattivata") continue;
    let level: NetLevel =
      p.condition === "OK"
        ? "ok"
        : p.condition === "PAPER_NEAR_END"
          ? "warning"
          : p.condition === "UNKNOWN"
            ? "info"
            : "error";
    if (p.pendingJobs > 0 && RANK[level] < RANK.warning) level = "warning";
    const pending = p.pendingJobs > 0 ? ` · ${p.pendingJobs} ticket in attesa` : "";
    items.push({
      id: `printer-${p.printerId}`,
      group: "printer",
      label: `Stampante ${p.name}`,
      level: simulatedPrint ? "info" : level,
      message: `${p.message} · ${p.host}:${p.port}${pending}`,
      action: simulatedPrint
        ? "Stampa simulata: i ticket vengono salvati su file (HARDWARE_BRIDGE_MODE=mock)."
        : (PRINTER_ACTIONS[p.condition] ??
          (p.pendingJobs > 0 ? "Apri la Coda di stampa per ristamparli o toglierli." : undefined)),
    });
  }

  // ── Dispositivi ──
  const connected = listConnectedDevices();
  const localCassa = connected.find((c) => c.deviceKind === "cassa" && !c.paired);
  const builds = connected.map((c) => buildOf(c.clientVersion)).filter((b): b is string => !!b);
  // Riferimento: la cassa sul PC dell'Edge (servita insieme all'Edge); altrimenti la più diffusa
  const referenceBuild =
    buildOf(localCassa?.clientVersion) ??
    (builds.length > 0
      ? [...builds].sort((a, b) => builds.filter((x) => x === b).length - builds.filter((x) => x === a).length)[0]!
      : null);

  for (const d of listDevices(db)) {
    if (d.revokedAt) continue;
    const live = connected.find((c) => c.deviceId === d.id);
    const kind = KIND_LABEL[d.kind] ?? d.kind;
    const label = d.name?.trim() ? d.name : kind;
    if (live) {
      const build = buildOf(live.clientVersion);
      const mismatch = !!referenceBuild && !!build && build !== referenceBuild;
      items.push({
        id: `device-${d.id}`,
        group: "device",
        label,
        level: mismatch ? "warning" : "ok",
        message: `Collegato${live.remoteAddress ? ` · ${live.remoteAddress}` : ""}${build ? ` · versione ${build}` : ""}`,
        action: mismatch
          ? `Versione diversa dalla cassa (${referenceBuild}): su ${label} ricarica la pagina (o chiudi e riapri l'app).`
          : undefined,
      });
      continue;
    }
    const lastMin = d.lastSeenAt ? (now - Date.parse(d.lastSeenAt)) / 60000 : Infinity;
    items.push({
      id: `device-${d.id}`,
      group: "device",
      label,
      // Appena sparito: probabilmente Wi-Fi o batteria. Da ore: spento a fine turno, normale.
      level: lastMin < 30 ? "warning" : "info",
      message: `Non collegato · ultimo contatto ${ago(d.lastSeenAt, now)}`,
      action:
        lastMin < 30
          ? `Controlla che ${DEVICE_ARTICLE[d.kind] ?? "il dispositivo"} sia acceso, sul Wi-Fi del locale e con la pagina aperta.`
          : undefined,
    });
  }

  // Collegati senza abbinamento (solo con DEVICE_PAIRING=off) e la cassa di questo PC
  for (const c of connected) {
    if (c.paired) continue;
    const kind = KIND_LABEL[c.deviceKind ?? ""] ?? "Dispositivo";
    const isThisPc = c === localCassa;
    items.push({
      id: `conn-${c.connectionId}`,
      group: "device",
      label: isThisPc ? "Cassa (questo PC)" : `${kind} non abbinato`,
      level: isThisPc ? "ok" : "warning",
      message: `Collegato${c.remoteAddress ? ` · ${c.remoteAddress}` : ""}${buildOf(c.clientVersion) ? ` · versione ${buildOf(c.clientVersion)}` : ""}`,
      action: isThisPc ? undefined : "Abbinalo con il PIN appena l'abbinamento dispositivi è di nuovo attivo.",
    });
  }

  // ── Sicurezza ──
  const pairingOn = pairingRequired();
  items.push({
    id: "pairing",
    group: "security",
    label: "Abbinamento dispositivi",
    level: pairingOn ? "ok" : "error",
    message: pairingOn
      ? "Attivo: solo i dispositivi abbinati con PIN possono usare la cassa"
      : "DISATTIVATO (DEVICE_PAIRING=off): qualsiasi telefono sul Wi-Fi può mandare comande",
    action: pairingOn ? undefined : "Togli DEVICE_PAIRING=off da edge.env e riavvia l'app appena finita l'emergenza.",
  });

  return {
    checkedAt: new Date(now).toISOString(),
    overall: worstLevel(items.map((i) => i.level)),
    addresses,
    hostname: hostname(),
    mdnsName: mdnsHostname(),
    referenceBuild,
    items,
  };
}
