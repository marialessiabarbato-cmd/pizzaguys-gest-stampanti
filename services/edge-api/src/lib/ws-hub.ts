import { randomUUID } from "node:crypto";
import type { TableStatus, WsEnvelope } from "@pizzaguys/types";

type WsClient = { send: (data: string) => void; readyState: number };

const clients = new Set<WsClient>();

export function addWsClient(client: WsClient) {
  clients.add(client);
}

export function removeWsClient(client: WsClient) {
  clients.delete(client);
}

export function broadcast(envelope: WsEnvelope) {
  const data = JSON.stringify(envelope);
  for (const client of clients) {
    if (client.readyState === 1) client.send(data);
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
