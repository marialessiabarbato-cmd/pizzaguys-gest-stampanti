import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Collegamento WebSocket con l'Edge, comune a cassa, palmare e KDS.
 *
 * - Controllo di vita: PING ogni 10 s; se dall'Edge non arriva nulla per 25 s il collegamento
 *   è considerato morto (es. telefono uscito dal Wi-Fi) e viene chiuso e riaperto.
 * - Riconnessione con attesa crescente (1 → 2 → 5 → 10 s), immediata quando il device torna
 *   online o la pagina torna in primo piano.
 * - `reconnects` aumenta a ogni riconnessione riuscita: le app lo usano per ricaricare lo stato
 *   (tavoli, comande KDS) perso mentre erano scollegate.
 * - `send` restituisce false se il messaggio non è partito: mai scarti silenziosi.
 * - Più componenti possono ascoltare lo stesso tipo di messaggio.
 */

const PING_EVERY_MS = 10_000;
const DEAD_AFTER_MS = 25_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

export type EdgeWsState = "connecting" | "open" | "closed";

export interface EdgeWsInfo {
  state: EdgeWsState;
  /** Ultimo messaggio ricevuto dall'Edge (ISO) */
  lastMessageAt: string | null;
  /** Tentativi di riconnessione falliti consecutivi */
  failedAttempts: number;
  /** Secondi al prossimo tentativo (se chiuso) */
  nextRetryInSec: number | null;
  /** Da quando il collegamento è giù (ISO), null se aperto */
  downSince: string | null;
}

interface Envelope {
  type: string;
  payload: unknown;
  timestamp: string;
  messageId: string;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** ID stabile del device (resta uguale tra ricariche), salvato nel browser se possibile. */
export function getStableDeviceId(kind: string): string {
  const key = `pg-device-id-${kind}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const id = `${kind}-${newId()}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `${kind}-${newId()}`;
  }
}

export function useEdgeWsConnection(options: { url: string; deviceKind: string; clientVersion: string }) {
  const { url, deviceKind, clientVersion } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const [connected, setConnected] = useState(false);
  const [reconnects, setReconnects] = useState(0);
  const [info, setInfo] = useState<EdgeWsInfo>({
    state: "connecting",
    lastMessageAt: null,
    failedAttempts: 0,
    nextRetryInSec: null,
    downSince: new Date().toISOString(),
  });

  const on = useCallback((type: string, handler: (payload: unknown) => void) => {
    const set = handlersRef.current.get(type) ?? new Set();
    set.add(handler);
    handlersRef.current.set(type, set);
    return () => {
      set.delete(handler);
    };
  }, []);

  const send = useCallback((type: string, payload: unknown): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(
        JSON.stringify({ type, payload, timestamp: new Date().toISOString(), messageId: newId() } satisfies Envelope),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failed = 0;
    let everOpened = false;
    let lastMessageMs = 0;
    let downSince: string | null = new Date().toISOString();
    const deviceId = getStableDeviceId(deviceKind);

    const scheduleRetry = () => {
      if (!alive) return;
      const wait = BACKOFF_MS[Math.min(failed, BACKOFF_MS.length - 1)] ?? 10_000;
      failed += 1;
      setInfo((i) => ({ ...i, state: "closed", failedAttempts: failed, nextRetryInSec: Math.round(wait / 1000), downSince }));
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, wait);
    };

    const connect = () => {
      if (!alive) return;
      clearTimeout(retryTimer);
      const current = wsRef.current;
      if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return;

      setInfo((i) => ({ ...i, state: "connecting", nextRetryInSec: null }));
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive || wsRef.current !== ws) return;
        failed = 0;
        lastMessageMs = Date.now();
        downSince = null;
        setConnected(true);
        setInfo({ state: "open", lastMessageAt: new Date().toISOString(), failedAttempts: 0, nextRetryInSec: null, downSince: null });
        if (everOpened) setReconnects((n) => n + 1);
        everOpened = true;
        ws.send(
          JSON.stringify({
            type: "HANDSHAKE",
            payload: { deviceId, deviceKind, clientVersion },
            timestamp: new Date().toISOString(),
            messageId: newId(),
          } satisfies Envelope),
        );
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (!downSince) downSince = new Date().toISOString();
        setConnected(false);
        scheduleRetry();
      };
      ws.onerror = () => {
        // onclose segue sempre: la riconnessione parte da lì
      };
      ws.onmessage = (ev) => {
        lastMessageMs = Date.now();
        let msg: Envelope;
        try {
          msg = JSON.parse(ev.data as string) as Envelope;
        } catch {
          return;
        }
        setInfo((i) => ({ ...i, lastMessageAt: new Date().toISOString() }));
        const handlers = handlersRef.current.get(msg.type);
        if (handlers) for (const h of [...handlers]) h(msg.payload);
      };
    };

    // Controllo di vita: PING regolare; nessuna risposta per 25 s → collegamento morto
    const ping = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageMs > DEAD_AFTER_MS) {
        ws.close();
        // Alcuni browser tardano a emettere onclose su un collegamento morto
        if (wsRef.current === ws) {
          wsRef.current = null;
          if (!downSince) downSince = new Date().toISOString();
          setConnected(false);
          scheduleRetry();
        }
        return;
      }
      try {
        ws.send(JSON.stringify({ type: "PING", payload: {}, timestamp: new Date().toISOString(), messageId: newId() } satisfies Envelope));
      } catch {
        /* onclose gestisce */
      }
    }, PING_EVERY_MS);

    const reconnectNow = () => {
      failed = 0;
      connect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisible);

    connect();

    return () => {
      alive = false;
      clearTimeout(retryTimer);
      clearInterval(ping);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisible);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [url, deviceKind, clientVersion]);

  return { connected, send, on, reconnects, info };
}
