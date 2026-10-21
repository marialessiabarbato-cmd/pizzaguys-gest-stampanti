import { randomUUID } from "node:crypto";
import type { TableStatus, WsEnvelope } from "@pizzaguys/types";

/** Sottoinsieme del socket `ws` usato dall'hub (ping/pong per il controllo di vita). */
export type WsClient = {
  send: (data: string) => void;
  readyState: number;
  ping?: () => void;
  terminate?: () => void;
  close?: (code?: number, reason?: string) => void;
  on?: (event: "pong", listener: () => void) => void;
};

/** Device collegato via WebSocket, per lo stato rete in cassa. */
export interface ConnectedDevice {
  connectionId: string;
  deviceId: string | null;
  deviceKind: string | null;
  /** Nome del device abbinato (es. "Palmare Marco") */
  deviceName: string | null;
  /** true se si è presentato con un token di abbinamento valido */
  paired: boolean;
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

export function addWsClient(
  client: WsClient,
  remoteAddress?: string,
  pairedDevice?: { id: string; name: string; kind: string } | null,
) {
  const now = new Date().toISOString();
  const info = {
    connectionId: randomUUID(),
    deviceId: pairedDevice?.id ?? null,
    deviceKind: pairedDevice?.kind ?? null,
    deviceName: pairedDevice?.name ?? null,
    paired: Boolean(pairedDevice),
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
  // Per i device abbinati identità e tipo vengono dal token, non da quanto dichiarano
  if (!info.paired) {
    info.deviceId = typeof data.deviceId === "string" ? data.deviceId.slice(0, 80) : null;
    info.deviceKind = typeof data.deviceKind === "string" ? data.deviceKind.slice(0, 20) : null;
  }
  info.clientVersion = typeof data.clientVersion === "string" ? data.clientVersion.slice(0, 40) : null;
}

export function removeWsClient(client: WsClient) {
  clients.delete(client);
}

/** Chiude i collegamenti di un device revocato (codice 4401: l'app chiede di riabbinarsi). */
export function disconnectDevice(deviceId: string) {
  for (const [client, info] of clients) {
    if (info.deviceId !== deviceId) continue;
    clients.delete(client);
    try {
      client.send(
        JSON.stringify({
          type: "ERROR",
          payload: { code: "DEVICE_REVOKED", message: "Questo dispositivo è stato scollegato dalla cassa: entra di nuovo con il PIN per riabbinarlo." },
          timestamp: new Date().toISOString(),
          messageId: randomUUID(),
        }),
      );
      client.close?.(4401, "DEVICE_REVOKED");
    } catch {
      /* già chiuso */
    }
  }
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
