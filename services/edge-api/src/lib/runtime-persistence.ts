import { runtimeState, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { FastifyInstance } from "fastify";
import { exportClosureState, importClosureState } from "./closure-state.js";
import { exportCounterOrderState, importCounterOrderState } from "./counter-order.js";
import { exportRuntimeState, importRuntimeState, summarizeRuntimeState } from "./runtime.js";
import { exportShiftLedgerState, importShiftLedgerState } from "./shift-ledger.js";

/** Versione del formato salvato: se cambia la struttura, aggiornare e gestire la migrazione. */
export const RUNTIME_STATE_VERSION = 1;

/** Salvataggio di sicurezza anche senza richieste (es. lock scaduti). */
const SAFETY_SAVE_MS = 30_000;

interface StateModule {
  namespace: string;
  exportState: () => unknown;
  importState: (snapshot: never) => unknown;
}

const MODULES: StateModule[] = [
  { namespace: "runtime", exportState: exportRuntimeState, importState: importRuntimeState },
  { namespace: "counter-orders", exportState: exportCounterOrderState, importState: importCounterOrderState },
  { namespace: "shift-ledger", exportState: exportShiftLedgerState, importState: importShiftLedgerState },
  { namespace: "closure", exportState: exportClosureState, importState: importClosureState },
];

export interface RestoreInfo {
  restoredAt: string;
  openTables: number;
  openOrders: number;
  openCounterOrders: number;
  releasedLocks: number;
  /** Moduli non ripristinati (copia conservata in runtime_state come "<modulo>.corrupt-<ts>"). */
  errors: string[];
}

/** Ultimo payload scritto per modulo: evita scritture quando nulla è cambiato. */
const lastSaved = new Map<string, string>();
let restoreInfo: RestoreInfo | null = null;

export function saveRuntimeState(db: EdgeDatabase): number {
  const changed = MODULES.map((m) => [m.namespace, JSON.stringify(m.exportState())] as const).filter(
    ([namespace, payload]) => lastSaved.get(namespace) !== payload,
  );
  if (changed.length === 0) return 0;

  const updatedAt = new Date().toISOString();
  db.transaction((tx) => {
    for (const [namespace, payload] of changed) {
      tx.insert(runtimeState)
        .values({ namespace, version: RUNTIME_STATE_VERSION, payload, updatedAt })
        .onConflictDoUpdate({
          target: runtimeState.namespace,
          set: { version: RUNTIME_STATE_VERSION, payload, updatedAt },
        })
        .run();
    }
  });
  for (const [namespace, payload] of changed) lastSaved.set(namespace, payload);
  return changed.length;
}

/** Ricarica lo stato salvato. Va chiamata all'avvio, prima di accettare richieste. */
export function restoreRuntimeState(db: EdgeDatabase): RestoreInfo | null {
  const rows = db.select().from(runtimeState).all();
  const errors: string[] = [];
  let releasedLocks = 0;
  let restoredAny = false;

  for (const mod of MODULES) {
    const row = rows.find((r) => r.namespace === mod.namespace);
    if (!row) continue;
    try {
      if (row.version !== RUNTIME_STATE_VERSION) {
        throw new Error(`versione ${row.version} non supportata (attesa ${RUNTIME_STATE_VERSION})`);
      }
      const result = mod.importState(JSON.parse(row.payload) as never) as { releasedLocks?: number } | void;
      releasedLocks += result?.releasedLocks ?? 0;
      lastSaved.set(mod.namespace, row.payload);
      restoredAny = true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push(`${mod.namespace}: ${reason}`);
      db.insert(runtimeState)
        .values({ ...row, namespace: `${mod.namespace}.corrupt-${Date.now()}` })
        .run();
    }
  }

  const counterIds = new Set(exportCounterOrderState().counterOrders.map(([id]) => id));
  const { openTables, openOrders } = summarizeRuntimeState(counterIds);
  const openCounterOrders = exportCounterOrderState().counterOrders.filter(([, o]) => !o.paidAt).length;
  const somethingOpen = restoredAny && (openTables > 0 || openOrders > 0 || openCounterOrders > 0);
  restoreInfo =
    somethingOpen || errors.length > 0
      ? {
          restoredAt: new Date().toISOString(),
          openTables,
          openOrders,
          openCounterOrders,
          releasedLocks,
          errors,
        }
      : null;
  return restoreInfo;
}

/** Esito dell'ultimo ripristino (null se all'avvio non c'era nulla da ripristinare). */
export function getRestoreInfo(): RestoreInfo | null {
  return restoreInfo;
}

/**
 * Salva lo stato dopo ogni richiesta che modifica dati, ogni 30 s e alla chiusura
 * del processo. I messaggi WebSocket chiamano saveRuntimeStateSafe() da ws.ts.
 */
export function registerRuntimePersistence(app: FastifyInstance) {
  app.addHook("onResponse", async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      saveRuntimeStateSafe(app);
    }
  });

  const timer = setInterval(() => saveRuntimeStateSafe(app), SAFETY_SAVE_MS);
  timer.unref();

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      saveRuntimeStateSafe(app);
      process.exit(0);
    });
  }
}

export function saveRuntimeStateSafe(app: FastifyInstance) {
  try {
    saveRuntimeState(app.edgeDb);
  } catch (err) {
    app.log.error({ err }, "Salvataggio stato operativo non riuscito");
  }
}
