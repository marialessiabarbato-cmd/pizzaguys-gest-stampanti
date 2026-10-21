import type { WsMessageType } from "@pizzaguys/types";
import { resolveEdgeUrl, useEdgeWsConnection } from "@pizzaguys/ui";

const WS_URL = resolveEdgeUrl(import.meta.env.VITE_EDGE_WS_URL, "ws://localhost:4100/ws");

/** Collegamento live con l'Edge (vedi useEdgeWsConnection in @pizzaguys/ui). */
export function useEdgeWs() {
  const ws = useEdgeWsConnection({ url: WS_URL, deviceKind: "kds", clientVersion: "kds-0.2.0" });
  return {
    ...ws,
    on: ws.on as (type: WsMessageType, handler: (payload: unknown) => void) => () => void,
    send: ws.send as (type: WsMessageType, payload: unknown) => boolean,
  };
}
