import type { WsEnvelope, WsMessageType } from "@pizzaguys/types";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_EDGE_WS_URL ?? "ws://localhost:4100/ws";

export function useEdgeWs() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<WsMessageType, (payload: unknown) => void>>(new Map());

  const on = useCallback((type: WsMessageType, handler: (payload: unknown) => void) => {
    handlersRef.current.set(type, handler);
    return () => handlersRef.current.delete(type);
  }, []);

  const send = useCallback((type: WsMessageType, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type,
          payload,
          timestamp: new Date().toISOString(),
          messageId: crypto.randomUUID(),
        } satisfies WsEnvelope),
      );
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setConnected(true);
        send("HANDSHAKE", { deviceId: crypto.randomUUID(), clientVersion: "kds-0.1.0" });
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(connect, 3000);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as WsEnvelope;
        handlersRef.current.get(msg.type)?.(msg.payload);
      };
    };

    connect();
    const ping = setInterval(() => send("PING", {}), 30_000);

    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [send]);

  return { connected, send, on };
}
