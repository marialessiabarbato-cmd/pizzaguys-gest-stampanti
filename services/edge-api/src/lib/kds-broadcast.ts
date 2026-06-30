import { randomUUID } from "node:crypto";
import { getKdsSnapshot } from "./runtime.js";
import { broadcast } from "./ws-hub.js";

export function broadcastKdsUpdate(extra?: {
  cancellation?: ReturnType<typeof getKdsSnapshot>["cancellations"][0];
}) {
  const snapshot = getKdsSnapshot();
  broadcast({
    type: "KDS_ORDER_UPDATE",
    payload: {
      ...snapshot,
      cancellation: extra?.cancellation,
    },
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}
