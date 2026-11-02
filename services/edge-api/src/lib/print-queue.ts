import { randomUUID } from "node:crypto";
import { printJobs, printers, type EdgeDatabase, type PrintJobStatus } from "@pizzaguys/edge-db";
import {
  CONDITION_MESSAGES,
  createHardwareBridge,
  type HardwareBridge,
  type PrinterCondition,
  type PrinterStatus,
  type PrintResult,
  type PrintTarget,
} from "@pizzaguys/hardware-bridge";
import type { PrintJobKind, PrintNoticePayload } from "@pizzaguys/types";
import { and, eq, inArray, lt, lte } from "drizzle-orm";
import { broadcast } from "./ws-hub.js";

/**
 * Coda di stampa (piano rete R3).
 *
 * Ogni ticket ESC/POS viene salvato su SQLite prima di essere inviato. Poi:
 * 1. si prova la stampante prevista (con lettura dello stato: carta, coperchio, errore);
 * 2. se non stampa e il reparto ha una stampante di riserva, si dirotta lì e la cassa
 *    riceve l'avviso "Comanda tavolo 5 stampata su BAR al posto di CUCINA (carta finita)";
 * 3. se non stampa da nessuna parte il ticket resta in attesa e viene ritentato da solo
 *    (10 s, 20 s, 30 s, poi ogni minuto) per 2 ore, e subito quando la stampante torna pronta.
 *
 * Tutti gli accessi a una stessa stampante (stampe e controlli di stato) passano in fila
 * uno alla volta: le Epson accettano una sola connessione per volta sulla porta 9100.
 */

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
let hardware: HardwareBridge = createHardwareBridge({ printDir: PRINT_DIR });

const RETRY_DELAYS_S = [10, 20, 30, 60];
const MAX_PENDING_MS = 2 * 60 * 60 * 1000;
const RETENTION_DAYS = 7;
const WORKER_INTERVAL_MS = 5000;

const KIND_LABELS: Record<PrintJobKind, string> = {
  COMANDA: "Comanda",
  MARCIA: "Marcia",
  DOLCI: "Dolci",
  ANNULLO: "Annullo",
  PRECONTO: "Preconto",
  COPIA_SCONTRINO: "Copia scontrino",
  CHIUSURA_CASSA: "Report chiusura cassa",
  COPIA_CASSA: "Copia comanda",
  PRENOTAZIONI: "Lista prenotazioni",
  TEST: "Stampa di prova",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as PrintJobKind] ?? kind;
}

export function jobSubject(kind: string, tableLabel: string): string {
  return kind === "CHIUSURA_CASSA" || kind === "PRENOTAZIONI" || kind === "TEST" || !tableLabel
    ? tableLabel
    : `tavolo ${tableLabel}`;
}

// ── Accesso in fila alle stampanti ──────────────────────────────────────────

const printerLocks = new Map<string, Promise<unknown>>();

/** Esegue `fn` quando nessun altro sta usando la stessa stampante (host:porta). */
export function withPrinterLock<T>(target: PrintTarget | undefined, fn: () => Promise<T>): Promise<T> {
  if (!target) return fn();
  const key = `${target.host}:${target.port}`;
  const prev = printerLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  printerLocks.set(key, tail);
  void tail.then(() => {
    if (printerLocks.get(key) === tail) printerLocks.delete(key);
  });
  return run;
}

// ── Stato noto delle stampanti (aggiornato da stampe e controlli periodici) ─

const lastKnown = new Map<string, PrinterStatus>();

export function getKnownStatus(printerId: string): PrinterStatus | undefined {
  return lastKnown.get(printerId);
}

export function setKnownStatus(printerId: string, status: PrinterStatus) {
  lastKnown.set(printerId, status);
}

function rememberCondition(printerId: string, condition: PrinterCondition | undefined, ok: boolean) {
  const c: PrinterCondition = condition ?? (ok ? "OK" : "UNREACHABLE");
  const prev = lastKnown.get(printerId);
  lastKnown.set(printerId, {
    condition: c,
    supported: prev?.supported ?? condition !== undefined,
    paperNearEnd: c === "PAPER_NEAR_END",
    message: CONDITION_MESSAGES[c],
    checkedAt: new Date().toISOString(),
  });
}

// ── Invio ───────────────────────────────────────────────────────────────────

type PrinterRow = typeof printers.$inferSelect;

function targetOf(p: PrinterRow | undefined): PrintTarget | undefined {
  return p ? { host: p.host, port: p.port } : undefined;
}

/** Una prova su una stampante, in fila con gli altri accessi alla stessa. */
export async function sendToPrinter(
  printerId: string,
  printer: PrinterRow | undefined,
  payload: Buffer,
  label: string,
): Promise<PrintResult> {
  const target = targetOf(printer);
  const result = await withPrinterLock(target, () => hardware.printEscPos(printerId, payload, label, target));
  if (printer) rememberCondition(printer.id, result.condition, result.success);
  return result;
}

/** Motivo leggibile dell'errore di stampa. */
export function friendlyReason(error?: string, condition?: string): string {
  if (condition && condition !== "UNREACHABLE" && condition !== "UNKNOWN" && condition !== "OK") {
    return CONDITION_MESSAGES[condition as PrinterCondition] ?? condition;
  }
  if (!error) return "errore sconosciuto";
  if (/ECONNREFUSED/.test(error)) return "la stampante rifiuta la connessione (spenta o porta errata)";
  if (/Timeout|ETIMEDOUT/i.test(error)) return "nessuna risposta (spenta, cavo scollegato o IP errato)";
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/.test(error)) return "rete non raggiungibile (cavo o IP errato)";
  return error;
}

function findPrinter(edgeDb: EdgeDatabase, id: string | null | undefined): PrinterRow | undefined {
  if (!id) return undefined;
  return edgeDb.select().from(printers).where(eq(printers.id, id)).get();
}

/** Stampante di riserva utilizzabile: attiva e su un indirizzo diverso dalla principale. */
export function resolveFallback(edgeDb: EdgeDatabase, primary: PrinterRow | undefined): PrinterRow | undefined {
  if (!primary?.fallbackPrinterId) return undefined;
  const fb = findPrinter(edgeDb, primary.fallbackPrinterId);
  if (!fb || !fb.enabled || fb.id === primary.id) return undefined;
  if (fb.host === primary.host && fb.port === primary.port) return undefined;
  return fb;
}

function nextAttemptAt(attempts: number, from = Date.now()): string {
  const delay = RETRY_DELAYS_S[Math.min(attempts - 1, RETRY_DELAYS_S.length - 1)] ?? 60;
  return new Date(from + delay * 1000).toISOString();
}

function notify(payload: PrintNoticePayload) {
  broadcast({
    type: "PRINT_NOTICE",
    payload,
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}

export interface QueuedPrintInput {
  kind: PrintJobKind;
  tableLabel: string;
  /** Id della stampante nel DB, o nome simbolico se non configurata (stampa simulata). */
  printerId: string;
  label: string;
  payload: Buffer;
  reprintOf?: string;
}

export interface QueuedPrintResult extends PrintResult {
  jobId: string;
  status: PrintJobStatus;
  /** Nome della stampante di riserva usata, se dirottato. */
  reroutedTo?: string;
  /** true se il ticket resta in coda e verrà ritentato da solo. */
  willRetry?: boolean;
}

interface AttemptOutcome {
  status: PrintJobStatus;
  result: PrintResult;
  printedOn?: PrinterRow;
  primary?: PrinterRow;
  primaryError?: string;
}

/** Prova la principale (salvo se si sa già che non è raggiungibile) e poi la riserva. */
async function attempt(
  edgeDb: EdgeDatabase,
  printerId: string,
  payload: Buffer,
  label: string,
): Promise<AttemptOutcome> {
  const primary = findPrinter(edgeDb, printerId);
  const fallback = resolveFallback(edgeDb, primary);
  const known = primary ? lastKnown.get(primary.id) : undefined;
  const recentlyUnreachable =
    !!fallback &&
    known?.condition === "UNREACHABLE" &&
    Date.now() - Date.parse(known.checkedAt) < 35_000;

  let primaryResult: PrintResult | undefined;
  if (!recentlyUnreachable) {
    primaryResult = await sendToPrinter(primary?.id ?? printerId, primary, payload, label);
    if (primaryResult.success) {
      return { status: "PRINTED", result: primaryResult, printedOn: primary, primary };
    }
  }
  const primaryError = primaryResult
    ? friendlyReason(primaryResult.error, primaryResult.condition)
    : CONDITION_MESSAGES.UNREACHABLE;

  if (fallback) {
    const fbResult = await sendToPrinter(fallback.id, fallback, payload, label);
    if (fbResult.success) {
      return { status: "REROUTED", result: fbResult, printedOn: fallback, primary, primaryError };
    }
  }
  return {
    status: "RETRYING",
    result: primaryResult ?? { success: false, printerId, error: primaryError, condition: "UNREACHABLE" },
    primary,
    primaryError,
  };
}

function reroutedMessage(kind: string, tableLabel: string, primary: PrinterRow | undefined, printedOn: PrinterRow, reason?: string) {
  const from = primary?.name ?? "stampante prevista";
  return `${kindLabel(kind)} ${jobSubject(kind, tableLabel)} stampata su ${printedOn.name} al posto di ${from}${reason ? ` (${reason})` : ""}`;
}

/**
 * Salva il ticket nella coda e prova subito a stamparlo.
 * Il risultato è compatibile con il vecchio `printEscPos`: `success` è true se il ticket
 * è uscito (anche sulla stampante di riserva).
 */
export async function printQueued(edgeDb: EdgeDatabase, input: QueuedPrintInput): Promise<QueuedPrintResult> {
  const now = new Date().toISOString();
  const primaryRow = findPrinter(edgeDb, input.printerId);
  const jobId = randomUUID();
  edgeDb
    .insert(printJobs)
    .values({
      id: jobId,
      kind: input.kind,
      tableLabel: input.tableLabel,
      printerId: input.printerId,
      printerName: primaryRow?.name ?? input.printerId,
      label: input.label,
      payload: input.payload,
      status: "QUEUED",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      reprintOf: input.reprintOf ?? null,
    })
    .run();

  const outcome = await attempt(edgeDb, input.printerId, input.payload, input.label);
  const done = new Date().toISOString();

  if (outcome.status === "PRINTED" || outcome.status === "REROUTED") {
    edgeDb
      .update(printJobs)
      .set({
        status: outcome.status,
        attempts: 1,
        printedOnId: outcome.printedOn?.id ?? input.printerId,
        printedOnName: outcome.printedOn?.name ?? primaryRow?.name ?? input.printerId,
        printedAt: done,
        updatedAt: done,
        lastError: outcome.primaryError ?? null,
      })
      .where(eq(printJobs.id, jobId))
      .run();
    // La stampante ha appena stampato: se aveva ticket in attesa, ripartono subito
    if (outcome.status === "PRINTED" && outcome.printedOn && workerDb) {
      retryNowForPrinter(edgeDb, outcome.printedOn.id);
    }
    if (outcome.status === "REROUTED" && outcome.printedOn) {
      notify({
        level: "warning",
        event: "REROUTED",
        jobId,
        kind: input.kind,
        tableLabel: input.tableLabel,
        message: reroutedMessage(input.kind, input.tableLabel, outcome.primary, outcome.printedOn, outcome.primaryError),
      });
    }
    return {
      ...outcome.result,
      printerId: input.printerId,
      jobId,
      status: outcome.status,
      reroutedTo: outcome.status === "REROUTED" ? outcome.printedOn?.name : undefined,
    };
  }

  edgeDb
    .update(printJobs)
    .set({
      status: "RETRYING",
      attempts: 1,
      lastError: outcome.primaryError ?? outcome.result.error ?? null,
      nextAttemptAt: nextAttemptAt(1),
      updatedAt: done,
    })
    .where(eq(printJobs.id, jobId))
    .run();
  scheduleWorkerSoon();
  return {
    ...outcome.result,
    printerId: input.printerId,
    jobId,
    status: "RETRYING",
    willRetry: true,
  };
}

// ── Nuovi tentativi ─────────────────────────────────────────────────────────

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;
let workerDb: EdgeDatabase | null = null;
let lastCleanup = 0;

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
}

/** Un giro di nuovi tentativi sui ticket in attesa scaduti. Restituisce quanti ne ha stampati. */
export async function processRetries(edgeDb: EdgeDatabase): Promise<number> {
  if (workerRunning) return 0;
  workerRunning = true;
  let printed = 0;
  try {
    const nowIso = new Date().toISOString();
    const due = edgeDb
      .select()
      .from(printJobs)
      .where(and(eq(printJobs.status, "RETRYING"), lte(printJobs.nextAttemptAt, nowIso)))
      .orderBy(printJobs.createdAt)
      .all();

    for (const job of due) {
      // Il ticket potrebbe essere stato annullato o ristampato nel frattempo
      const current = edgeDb.select().from(printJobs).where(eq(printJobs.id, job.id)).get();
      if (!current || current.status !== "RETRYING") continue;

      const outcome = await attempt(edgeDb, job.printerId, job.payload, job.label);
      const attempts = job.attempts + 1;
      const at = new Date().toISOString();
      const waited = minutesSince(job.createdAt);

      if (outcome.status === "PRINTED" || outcome.status === "REROUTED") {
        printed++;
        edgeDb
          .update(printJobs)
          .set({
            status: outcome.status,
            attempts,
            printedOnId: outcome.printedOn?.id ?? job.printerId,
            printedOnName: outcome.printedOn?.name ?? job.printerName,
            printedAt: at,
            updatedAt: at,
            nextAttemptAt: null,
          })
          .where(eq(printJobs.id, job.id))
          .run();
        const where = outcome.printedOn?.name ?? job.printerName;
        const message =
          outcome.status === "REROUTED" && outcome.printedOn
            ? `${reroutedMessage(job.kind, job.tableLabel, outcome.primary, outcome.printedOn, outcome.primaryError)}, in ritardo di ${waited} min`
            : `${kindLabel(job.kind)} ${jobSubject(job.kind, job.tableLabel)} stampata ora su ${where} (in attesa da ${waited} min)`;
        notify({
          level: outcome.status === "REROUTED" ? "warning" : "info",
          event: outcome.status === "REROUTED" ? "REROUTED" : "RECOVERED",
          jobId: job.id,
          kind: job.kind as PrintJobKind,
          tableLabel: job.tableLabel,
          message,
        });
        continue;
      }

      const expired = Date.now() - Date.parse(job.createdAt) > MAX_PENDING_MS;
      edgeDb
        .update(printJobs)
        .set({
          status: expired ? "FAILED" : "RETRYING",
          attempts,
          lastError: outcome.primaryError ?? outcome.result.error ?? job.lastError,
          nextAttemptAt: expired ? null : nextAttemptAt(attempts),
          updatedAt: at,
        })
        .where(eq(printJobs.id, job.id))
        .run();
      if (expired) {
        notify({
          level: "error",
          event: "GAVE_UP",
          jobId: job.id,
          kind: job.kind as PrintJobKind,
          tableLabel: job.tableLabel,
          message: `${kindLabel(job.kind)} ${jobSubject(job.kind, job.tableLabel)} non stampata dopo ${attempts} tentativi: ristampala dalla cassa quando la stampante è pronta`,
        });
      }
    }

    if (Date.now() - lastCleanup > 60 * 60 * 1000) {
      lastCleanup = Date.now();
      cleanupOldJobs(edgeDb);
    }
  } finally {
    workerRunning = false;
  }
  return printed;
}

let soonTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWorkerSoon(delayMs = 10_000) {
  if (!workerDb || soonTimer) return;
  soonTimer = setTimeout(() => {
    soonTimer = null;
    if (workerDb) void processRetries(workerDb);
  }, delayMs);
  soonTimer.unref?.();
}

/** La stampante è tornata pronta: ritenta subito i suoi ticket in attesa. */
export function retryNowForPrinter(edgeDb: EdgeDatabase, printerId: string) {
  const now = new Date().toISOString();
  const pending = edgeDb
    .select({ id: printJobs.id, printerId: printJobs.printerId })
    .from(printJobs)
    .where(eq(printJobs.status, "RETRYING"))
    .all();
  const ids = pending
    .filter((j) => {
      if (j.printerId === printerId) return true;
      const p = findPrinter(edgeDb, j.printerId);
      return p?.fallbackPrinterId === printerId;
    })
    .map((j) => j.id);
  if (ids.length === 0) return 0;
  edgeDb.update(printJobs).set({ nextAttemptAt: now }).where(inArray(printJobs.id, ids)).run();
  void processRetries(edgeDb);
  return ids.length;
}

export function cleanupOldJobs(edgeDb: EdgeDatabase) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  edgeDb.delete(printJobs).where(lt(printJobs.createdAt, cutoff)).run();
}

/**
 * Avvia i nuovi tentativi automatici. I ticket rimasti "in invio" da un arresto improvviso
 * tornano in attesa (al massimo escono due volte, mai zero).
 */
export function startPrintQueue(edgeDb: EdgeDatabase) {
  workerDb = edgeDb;
  const now = new Date().toISOString();
  edgeDb
    .update(printJobs)
    .set({ status: "RETRYING", nextAttemptAt: now, updatedAt: now })
    .where(eq(printJobs.status, "QUEUED"))
    .run();
  cleanupOldJobs(edgeDb);
  lastCleanup = Date.now();
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = setInterval(() => void processRetries(edgeDb), WORKER_INTERVAL_MS);
  workerTimer.unref?.();
}

export function stopPrintQueue() {
  if (workerTimer) clearInterval(workerTimer);
  if (soonTimer) clearTimeout(soonTimer);
  workerTimer = null;
  soonTimer = null;
  workerDb = null;
}

// ── Ristampa e annullo ──────────────────────────────────────────────────────

/** Ristampa un ticket qualsiasi della coda, sulla sua stampante o su quella indicata. */
export async function reprintJob(edgeDb: EdgeDatabase, jobId: string, printerId?: string) {
  const job = edgeDb.select().from(printJobs).where(eq(printJobs.id, jobId)).get();
  if (!job) return null;
  // Se era ancora in attesa, la ristampa lo sostituisce: niente doppioni
  if (job.status === "RETRYING") {
    edgeDb
      .update(printJobs)
      .set({ status: "CANCELLED", nextAttemptAt: null, updatedAt: new Date().toISOString() })
      .where(eq(printJobs.id, job.id))
      .run();
  }
  return printQueued(edgeDb, {
    kind: job.kind as PrintJobKind,
    tableLabel: job.tableLabel,
    printerId: printerId ?? job.printerId,
    label: `${job.label}-ristampa`,
    payload: job.payload,
    reprintOf: job.reprintOf ?? job.id,
  });
}

/** Toglie dalla coda un ticket in attesa (es. tavolo già servito). */
export function cancelJob(edgeDb: EdgeDatabase, jobId: string): boolean {
  const job = edgeDb.select().from(printJobs).where(eq(printJobs.id, jobId)).get();
  if (!job || job.status !== "RETRYING") return false;
  edgeDb
    .update(printJobs)
    .set({ status: "CANCELLED", nextAttemptAt: null, updatedAt: new Date().toISOString() })
    .where(eq(printJobs.id, jobId))
    .run();
  return true;
}

export function countPendingByPrinter(edgeDb: EdgeDatabase): Map<string, number> {
  const rows = edgeDb
    .select({ printerId: printJobs.printerId })
    .from(printJobs)
    .where(eq(printJobs.status, "RETRYING"))
    .all();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.printerId, (map.get(r.printerId) ?? 0) + 1);
  return map;
}

/** Stato di una stampante letto ora (in fila con le stampe). */
export async function readPrinterStatus(printer: PrinterRow): Promise<PrinterStatus> {
  const target = targetOf(printer);
  const status = await withPrinterLock(target, () => hardware.getPrinterStatus(target));
  lastKnown.set(printer.id, status);
  return status;
}

/** Solo per i test. */
export function setPrintBridgeForTest(bridge: HardwareBridge) {
  hardware = bridge;
  lastKnown.clear();
}
