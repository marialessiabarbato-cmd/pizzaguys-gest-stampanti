import { syncQueue, type EdgeDatabase } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { CloudError } from "./cloud.js";

/**
 * Stato del collegamento con il Cloud, aggiornato a ogni heartbeat.
 * Prima "ultimo contatto" veniva aggiornato anche se il Cloud rifiutava il token: ora
 * conta solo una risposta valida, e l'errore è sempre visibile in /api/status.
 */
export type CloudLinkState = "UNKNOWN" | "OK" | "UNREACHABLE" | "UNAUTHORIZED" | "ERROR";

export interface CloudLinkStatus {
  state: CloudLinkState;
  /** Messaggio da mostrare in cassa (null se tutto ok) */
  message: string | null;
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  /** Da quando il Cloud non risponde correttamente (null se ok) */
  failingSince: string | null;
  consecutiveFailures: number;
  /** Livello di avviso in cassa secondo le soglie del piano (5 min / 2 ore / 24 ore) */
  level: "ok" | "info" | "warning" | "critical";
}

const WARN_INFO_MS = 5 * 60_000;
const WARN_WARNING_MS = 2 * 60 * 60_000;
const WARN_CRITICAL_MS = 24 * 60 * 60_000;

const status: Omit<CloudLinkStatus, "level"> = {
  state: "UNKNOWN",
  message: null,
  lastAttemptAt: null,
  lastOkAt: null,
  failingSince: null,
  consecutiveFailures: 0,
};

export function initCloudStatus(lastHeartbeatAt: string | null | undefined) {
  if (lastHeartbeatAt && !status.lastOkAt) status.lastOkAt = lastHeartbeatAt;
}

/** Registra una risposta valida; true se il Cloud è appena tornato dopo un errore. */
export function recordCloudOk(): boolean {
  const recovered = status.consecutiveFailures > 0;
  const now = new Date().toISOString();
  status.state = "OK";
  status.message = null;
  status.lastAttemptAt = now;
  status.lastOkAt = now;
  status.failingSince = null;
  status.consecutiveFailures = 0;
  return recovered;
}

export function recordCloudFailure(err: unknown) {
  const now = new Date().toISOString();
  status.lastAttemptAt = now;
  status.consecutiveFailures += 1;
  if (!status.failingSince) status.failingSince = status.lastOkAt && status.state === "UNKNOWN" ? status.lastOkAt : now;
  if (err instanceof CloudError) {
    status.state = err.kind === "UNAUTHORIZED" ? "UNAUTHORIZED" : err.kind === "UNREACHABLE" ? "UNREACHABLE" : "ERROR";
    status.message = err.message;
  } else {
    status.state = "ERROR";
    status.message = err instanceof Error ? err.message : "Errore sconosciuto con il Cloud";
  }
}

function levelFor(s: typeof status, nowMs: number): CloudLinkStatus["level"] {
  if (s.state === "OK" || s.state === "UNKNOWN") return "ok";
  // Token rifiutato: non si risolve da solo, subito avviso
  if (s.state === "UNAUTHORIZED") return "warning";
  const since = s.failingSince ? new Date(s.failingSince).getTime() : nowMs;
  const elapsed = nowMs - since;
  if (elapsed >= WARN_CRITICAL_MS) return "critical";
  if (elapsed >= WARN_WARNING_MS) return "warning";
  if (elapsed >= WARN_INFO_MS) return "info";
  return "ok";
}

export function getCloudStatus(now = Date.now()): CloudLinkStatus {
  return { ...status, level: levelFor(status, now) };
}

/** Riepilogo della coda verso il Cloud: quanti invii aspettano e l'ultimo errore. */
export function getSyncQueueSummary(db: EdgeDatabase) {
  const pending = db.select().from(syncQueue).where(eq(syncQueue.status, "PENDING")).all();
  const oldest = pending.reduce<string | null>(
    (min, i) => (min === null || i.createdAt < min ? i.createdAt : min),
    null,
  );
  const withError = pending
    .filter((i) => i.lastError)
    .sort((a, b) => (b.lastAttemptAt ?? "").localeCompare(a.lastAttemptAt ?? ""))[0];
  return {
    pending: pending.length,
    oldestPendingAt: oldest,
    lastError: withError?.lastError ?? null,
    lastErrorOperation: withError?.operation ?? null,
  };
}

/** Solo per i test */
export function resetCloudStatusForTest() {
  Object.assign(status, {
    state: "UNKNOWN",
    message: null,
    lastAttemptAt: null,
    lastOkAt: null,
    failingSince: null,
    consecutiveFailures: 0,
  });
}
