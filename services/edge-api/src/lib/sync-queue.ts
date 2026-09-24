import { randomUUID } from "node:crypto";
import type { MockElectronicInvoice } from "@pizzaguys/fiscal";
import { closureArchive, edgeState, syncQueue } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { cloudDailyClosure, cloudInvoiceSync, cloudCustomerProfileSync, cloudStaffSync } from "./cloud.js";
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

export interface InvoiceSyncJob {
  edgeInvoiceId: string;
  locationId: string;
  invoice: MockElectronicInvoice;
}

export function enqueueInvoiceSync(db: EdgeDatabase, job: InvoiceSyncJob) {
  const now = new Date().toISOString();
  db.insert(syncQueue)
    .values({
      id: randomUUID(),
      operation: "INVOICE_SYNC",
      payload: JSON.stringify(job),
      status: "PENDING",
      attempts: 0,
      createdAt: now,
    })
    .run();
}

export function enqueueCustomerProfileSync(
  db: EdgeDatabase,
  profile: {
    id: string;
    businessName: string;
    address?: string;
    postalCode?: string;
    province?: string;
    city?: string;
    country: string;
    vatNumber?: string;
    taxCode?: string;
    sdiCode?: string;
    pec?: string;
    phone?: string;
    email?: string;
    notes?: string;
    updatedAt?: string;
  },
) {
  const now = new Date().toISOString();
  db.insert(syncQueue)
    .values({
      id: randomUUID(),
      operation: "CUSTOMER_PROFILE_SYNC",
      payload: JSON.stringify(profile),
      status: "PENDING",
      attempts: 0,
      createdAt: now,
    })
    .run();
}

export interface StaffSyncJob {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "USER_ADMIN" | "CASHIER" | "WAITER";
  pinHash: string;
  isActive: boolean;
}

export function enqueueStaffSync(db: EdgeDatabase, job: StaffSyncJob) {
  const now = new Date().toISOString();
  db.insert(syncQueue)
    .values({
      id: randomUUID(),
      operation: "STAFF_SYNC",
      payload: JSON.stringify(job),
      status: "PENDING",
      attempts: 0,
      createdAt: now,
    })
    .run();
}

export async function tryImmediateStaffSync(db: EdgeDatabase, staffId: string) {
  const state = db.select().from(edgeState).where(sql`id = 1`).get();
  if (!state?.apiToken || state.status !== "ACTIVE") return;

  const item = db
    .select()
    .from(syncQueue)
    .where(eq(syncQueue.status, "PENDING"))
    .all()
    .find((row) => {
      if (row.operation !== "STAFF_SYNC") return false;
      const job = JSON.parse(row.payload) as StaffSyncJob;
      return job.id === staffId;
    });

  if (!item) return;

  await processStaffSyncItem(
    db,
    { info: () => {}, warn: () => {} } as unknown as FastifyBaseLogger,
    state.apiToken,
    item,
  );
}

export async function tryImmediateInvoiceSync(db: EdgeDatabase, edgeInvoiceId: string) {
  const state = db.select().from(edgeState).where(sql`id = 1`).get();
  if (!state?.apiToken || state.status !== "ACTIVE") return;

  const item = db
    .select()
    .from(syncQueue)
    .where(eq(syncQueue.status, "PENDING"))
    .all()
    .find((row) => {
      if (row.operation !== "INVOICE_SYNC") return false;
      const job = JSON.parse(row.payload) as InvoiceSyncJob;
      return job.edgeInvoiceId === edgeInvoiceId;
    });

  if (!item) return;

  await processInvoiceSyncItem(
    db,
    { info: () => {}, warn: () => {} } as unknown as FastifyBaseLogger,
    state.apiToken,
    item,
  );
}

async function processDailyClosureItem(
  db: EdgeDatabase,
  log: FastifyBaseLogger,
  apiToken: string,
  item: typeof syncQueue.$inferSelect,
) {
  const job = JSON.parse(item.payload) as DailyClosureSyncJob;
  const attemptAt = new Date().toISOString();

  try {
    const result = await cloudDailyClosure(apiToken, {
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

async function processInvoiceSyncItem(
  db: EdgeDatabase,
  log: FastifyBaseLogger,
  apiToken: string,
  item: typeof syncQueue.$inferSelect,
) {
  const job = JSON.parse(item.payload) as InvoiceSyncJob;
  const attemptAt = new Date().toISOString();

  try {
    const result = await cloudInvoiceSync(apiToken, {
      locationId: job.locationId,
      edgeInvoiceId: job.edgeInvoiceId,
      invoice: job.invoice,
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

    writeEdgeAudit(db, {
      operation: "INVOICE_SYNC_OK",
      severity: "INFO",
      nextState: {
        edgeInvoiceId: job.edgeInvoiceId,
        invoiceNumber: job.invoice.invoiceNumber,
        attempts: item.attempts + 1,
      },
    });

    log.info(
      { edgeInvoiceId: job.edgeInvoiceId, attempts: item.attempts + 1 },
      "Sync fattura completata da coda",
    );
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
      operation: "INVOICE_SYNC_FAILED",
      severity: "WARNING",
      nextState: {
        edgeInvoiceId: job.edgeInvoiceId,
        invoiceNumber: job.invoice.invoiceNumber,
        attempts: item.attempts + 1,
        error: message,
      },
    });

    log.warn({ edgeInvoiceId: job.edgeInvoiceId, err: message }, "Retry sync fattura fallito");
  }
}

async function processCustomerProfileSyncItem(
  db: EdgeDatabase,
  log: FastifyBaseLogger,
  apiToken: string,
  item: typeof syncQueue.$inferSelect,
) {
  const profile = JSON.parse(item.payload) as Record<string, unknown>;
  const attemptAt = new Date().toISOString();

  try {
    const result = await cloudCustomerProfileSync(apiToken, profile);

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

    log.info({ customerId: profile.id, attempts: item.attempts + 1 }, "Sync cliente completata");
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

    log.warn({ customerId: profile.id, err: message }, "Retry sync cliente fallito");
  }
}

async function processStaffSyncItem(
  db: EdgeDatabase,
  log: FastifyBaseLogger,
  apiToken: string,
  item: typeof syncQueue.$inferSelect,
) {
  const job = JSON.parse(item.payload) as StaffSyncJob;
  const attemptAt = new Date().toISOString();

  try {
    const result = await cloudStaffSync(apiToken, job);

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

    writeEdgeAudit(db, {
      operation: "STAFF_SYNC_OK",
      severity: "INFO",
      nextState: { staffId: job.id, attempts: item.attempts + 1 },
    });

    log.info({ staffId: job.id, attempts: item.attempts + 1 }, "Sync operatore completata");
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
      operation: "STAFF_SYNC_FAILED",
      severity: "WARNING",
      nextState: { staffId: job.id, attempts: item.attempts + 1, error: message },
    });

    log.warn({ staffId: job.id, err: message }, "Retry sync operatore fallito");
  }
}

export async function processSyncQueue(db: EdgeDatabase, log: FastifyBaseLogger) {
  const state = db.select().from(edgeState).where(sql`id = 1`).get();
  if (!state?.apiToken || state.status !== "ACTIVE") return;
  const apiToken = state.apiToken;

  const pending = db
    .select()
    .from(syncQueue)
    .where(eq(syncQueue.status, "PENDING"))
    .all();

  const now = Date.now();
  for (const item of pending) {
    if (
      item.lastAttemptAt &&
      now - new Date(item.lastAttemptAt).getTime() < SYNC_RETRY_INTERVAL_MS
    ) {
      continue;
    }

    if (item.operation === "DAILY_CLOSURE") {
      await processDailyClosureItem(db, log, apiToken, item);
      continue;
    }

    if (item.operation === "INVOICE_SYNC") {
      await processInvoiceSyncItem(db, log, apiToken, item);
      continue;
    }

    if (item.operation === "CUSTOMER_PROFILE_SYNC") {
      await processCustomerProfileSyncItem(db, log, apiToken, item);
      continue;
    }

    if (item.operation === "STAFF_SYNC") {
      await processStaffSyncItem(db, log, apiToken, item);
    }
  }
}
