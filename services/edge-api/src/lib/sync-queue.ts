import { randomUUID } from "node:crypto";
import { closureArchive, edgeState, syncQueue } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { cloudDailyClosure } from "./cloud.js";
import { writeEdgeAudit } from "./audit.js";

export const SYNC_RETRY_INTERVAL_MS = 15 * 60 * 1000;

export interface DailyClosureSyncJob {
  closureId: string;
  locationId: string;
  closureDate: string;
  fiscalZNumber: number;
  totals: {
    gross: number;
    byChannel: Record<string, number>;
    byPaymentMethod: Record<string, number>;
  };
  reconciliation: {
    cashDeclared: number;
    posDeclared: number;
    discrepancy: number;
  };
  receipts: unknown[];
}

export function enqueueDailyClosureSync(db: EdgeDatabase, job: DailyClosureSyncJob) {
  const now = new Date().toISOString();
  db.insert(syncQueue)
    .values({
      id: randomUUID(),
      operation: "DAILY_CLOSURE",
      payload: JSON.stringify(job),
      status: "PENDING",
      attempts: 0,
      createdAt: now,
    })
    .run();
}

export async function processSyncQueue(db: EdgeDatabase, log: FastifyBaseLogger) {
  const state = db.select().from(edgeState).where(sql`id = 1`).get();
  if (!state?.apiToken || state.status !== "ACTIVE") return;

  const pending = db
    .select()
    .from(syncQueue)
    .where(and(eq(syncQueue.status, "PENDING"), eq(syncQueue.operation, "DAILY_CLOSURE")))
    .all();

  const now = Date.now();
  for (const item of pending) {
    if (
      item.lastAttemptAt &&
      now - new Date(item.lastAttemptAt).getTime() < SYNC_RETRY_INTERVAL_MS
    ) {
      continue;
    }

    const job = JSON.parse(item.payload) as DailyClosureSyncJob;
    const attemptAt = new Date().toISOString();

    try {
      const result = await cloudDailyClosure(state.apiToken, {
        locationId: job.locationId,
        closureDate: job.closureDate,
        fiscalZNumber: job.fiscalZNumber,
        totals: job.totals,
        reconciliation: job.reconciliation,
        receipts: job.receipts,
      });

      db.update(syncQueue)
        .set({
          status: "COMPLETED",
          attempts: item.attempts + 1,
          lastAttemptAt: attemptAt,
          completedAt: result.receivedAt,
          lastError: null,
        })
        .where(eq(syncQueue.id, item.id))
        .run();

      db.update(closureArchive)
        .set({ syncedAt: result.receivedAt })
        .where(eq(closureArchive.id, job.closureId))
        .run();

      writeEdgeAudit(db, {
        operation: "DAILY_CLOSURE_SYNC_RETRY_OK",
        severity: "INFO",
        nextState: { closureId: job.closureId, closureDate: job.closureDate, attempts: item.attempts + 1 },
      });

      log.info({ closureId: job.closureId, attempts: item.attempts + 1 }, "Sync chiusura completata da coda");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync fallita";
      db.update(syncQueue)
        .set({
          attempts: item.attempts + 1,
          lastAttemptAt: attemptAt,
          lastError: message,
        })
        .where(eq(syncQueue.id, item.id))
        .run();

      writeEdgeAudit(db, {
        operation: "DAILY_CLOSURE_SYNC_RETRY_FAILED",
        severity: "WARNING",
        nextState: {
          closureId: job.closureId,
          closureDate: job.closureDate,
          attempts: item.attempts + 1,
          error: message,
        },
      });

      log.warn({ closureId: job.closureId, err: message }, "Retry sync chiusura fallito");
    }
  }
}
