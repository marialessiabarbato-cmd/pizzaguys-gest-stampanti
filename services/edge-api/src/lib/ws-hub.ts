import { randomUUID } from "node:crypto";
import type { TableStatus, WsEnvelope } from "@pizzaguys/types";

/** Sottoinsieme del socket `ws` usato dall'hub (ping/pong per il controllo di vita). */
export type WsClient = {
  send: (data: string) => void;
  readyState: number;
  ping?: () => void;
  terminate?: () => void;
  on?: (event: "pong", listener: () => void) => void;
};

/** Device collegato via WebSocket, per lo stato rete in cassa. */
export interface ConnectedDevice {
  connectionId: string;
  deviceId: string | null;
  deviceKind: string | null;
  clientVersion: string | null;
  remoteAddress: string | null;
  connectedAt: string;
  lastSeenAt: string;
}

const clients = new Map<WsClient, ConnectedDevice & { alive: boolean }>();

/** Ogni 15 s ping a tutti; chi non ha risposto al ping precedente viene chiuso (collegamento morto). */
const SERVER_PING_MS = 15_000;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function ensurePingLoop() {
  if (pingTimer) return;
  pingTimer = setInterval(() => {
    for (const [client, info] of clients) {
      if (!info.alive) {
        clients.delete(client);
        try {
          client.terminate?.();
        } catch {
          /* già chiuso */
        }
        continue;
      }
      info.alive = false;
      try {
        client.ping?.();
      } catch {
        /* close gestisce */
      }
    }
  }, SERVER_PING_MS);
  pingTimer.unref?.();
}

export function addWsClient(client: WsClient, remoteAddress?: string) {
  const now = new Date().toISOString();
  const info = {
    connectionId: randomUUID(),
    deviceId: null,
    deviceKind: null,
    clientVersion: null,
    remoteAddress: remoteAddress ?? null,
    connectedAt: now,
    lastSeenAt: now,
    alive: true,
  };
  clients.set(client, info);
  client.on?.("pong", () => {
    info.alive = true;
    info.lastSeenAt = new Date().toISOString();
  });
  ensurePingLoop();
}

/** Qualsiasi messaggio dal device conta come segno di vita. */
export function touchWsClient(client: WsClient) {
  const info = clients.get(client);
  if (!info) return;
  info.alive = true;
  info.lastSeenAt = new Date().toISOString();
}

export function identifyWsClient(
  client: WsClient,
  data: { deviceId?: string; deviceKind?: string; clientVersion?: string },
) {
  const info = clients.get(client);
  if (!info) return;
  info.deviceId = typeof data.deviceId === "string" ? data.deviceId.slice(0, 80) : null;
  info.deviceKind = typeof data.deviceKind === "string" ? data.deviceKind.slice(0, 20) : null;
  info.clientVersion = typeof data.clientVersion === "string" ? data.clientVersion.slice(0, 40) : null;
}

export function removeWsClient(client: WsClient) {
  clients.delete(client);
}

export function listConnectedDevices(): ConnectedDevice[] {
  return [...clients.values()].map(({ alive: _alive, ...d }) => d);
}

export function broadcast(envelope: WsEnvelope) {
  const data = JSON.stringify(envelope);
  for (const client of clients.keys()) {
    if (client.readyState === 1) {
      try {
        client.send(data);
      } catch {
        /* client in chiusura */
      }
    }
  }
}

export function broadcastTableStatus(tableId: string, status: TableStatus) {
  broadcast({
    type: "TABLE_STATUS_UPDATE",
    payload: { tableId, status },
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}

/** Solo per i test: ferma il ciclo di ping (ripartirà al prossimo client). */
export function stopWsPingLoopForTest() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}
