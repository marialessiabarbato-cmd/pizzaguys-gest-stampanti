import { useEffect, useState } from "react";
import { edgeApi } from "./api";

export interface CloudStatusView {
  state: "UNKNOWN" | "OK" | "UNREACHABLE" | "UNAUTHORIZED" | "ERROR";
  message: string | null;
  lastOkAt: string | null;
  failingSince: string | null;
  level: "ok" | "info" | "warning" | "critical";
}

export interface SyncQueueView {
  pending: number;
  oldestPendingAt: string | null;
  lastError: string | null;
}

/** Stato Cloud e coda di sincronizzazione, letti dall'Edge ogni 30 s (solo con Edge collegato). */
export function useCloudStatus(enabled: boolean) {
  const [cloud, setCloud] = useState<CloudStatusView | null>(null);
  const [syncQueue, setSyncQueue] = useState<SyncQueueView | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      edgeApi<{ cloud?: CloudStatusView; syncQueue?: SyncQueueView }>("/api/status")
        .then((s) => {
          if (!alive) return;
          setCloud(s.cloud ?? null);
          setSyncQueue(s.syncQueue ?? null);
        })
        .catch(() => {
          /* Edge non raggiungibile: lo mostra già l'indicatore di collegamento */
        });
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, nonce]);

  return { cloud, syncQueue, refresh: () => setNonce((n) => n + 1) };
}
