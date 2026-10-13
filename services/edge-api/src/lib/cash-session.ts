import { randomUUID } from "node:crypto";
import {
  cashMovements,
  cashSessions,
  closureArchive,
  fiscalDocuments,
  type EdgeDatabase,
} from "@pizzaguys/edge-db";
import {
  DEFAULT_CASH_DISCREPANCY_NOTE_THRESHOLD,
  isCashOperatorRole,
  type CashBreakdown,
  type CashMovement,
  type CashMovementType,
  type CashService,
  type CashSession,
  type CashSessionStatusPayload,
  type CashSessionSummary,
  type CashSessionTheoretical,
  type PaymentSplit,
} from "@pizzaguys/types";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import { localDateKey } from "./business-date.js";
import { getMenuSnapshot } from "./provision.js";
import { getAllTableRuntime, getPendingPaymentRequests } from "./runtime.js";
import { verifyPin, type VerifiedStaff } from "./staff-auth.js";
import { broadcast } from "./ws-hub.js";

/** Il locale è operativo solo con una sessione di cassa aperta. */
export const CASH_SESSION_CLOSED = {
  error: "Cassa chiusa — l'operatore cassa deve aprire il servizio",
  code: "CASH_SESSION_CLOSED",
} as const;

export class CashSessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type SessionRow = typeof cashSessions.$inferSelect;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function mapSession(row: SessionRow): CashSession {
  return {
    id: row.id,
    businessDate: row.businessDate,
    service: row.service,
    status: row.status,
    openedByStaffId: row.openedByStaffId,
    openedByName: row.openedByName,
    openedAt: row.openedAt,
    openingFund: row.openingFund,
    openingFundBreakdown: parseJson<CashBreakdown>(row.openingFundBreakdown),
    closedByStaffId: row.closedByStaffId,
    closedByName: row.closedByName,
    closedAt: row.closedAt,
    countedCash: row.countedCash,
    countedCashBreakdown: parseJson<CashBreakdown>(row.countedCashBreakdown),
    posDeclared: row.posDeclared,
    closingFundLeft: row.closingFundLeft,
    theoretical: parseJson<CashSessionTheoretical>(row.theoreticalJson),
    discrepancyCash: row.discrepancyCash,
    discrepancyPos: row.discrepancyPos,
    notes: row.notes,
    syncedAt: row.syncedAt,
  };
}

function mapMovement(row: typeof cashMovements.$inferSelect): CashMovement {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    amount: row.amount,
    reason: row.reason,
    staffId: row.staffId,
    staffName: row.staffName,
    createdAt: row.createdAt,
  };
}

// ── Stato ────────────────────────────────────────────────────────────────────

export function getOpenCashSession(db: EdgeDatabase): CashSession | null {
  const row = db.select().from(cashSessions).where(eq(cashSessions.status, "OPEN")).get();
  return row ? mapSession(row) : null;
}

export function isCashSessionOpen(db: EdgeDatabase): boolean {
  return getOpenCashSession(db) != null;
}

export function getCashSession(db: EdgeDatabase, id: string): CashSession | null {
  const row = db.select().from(cashSessions).where(eq(cashSessions.id, id)).get();
  return row ? mapSession(row) : null;
}

function getLastClosedSession(db: EdgeDatabase): CashSession | null {
  const row = db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.status, "CLOSED"))
    .orderBy(desc(cashSessions.closedAt))
    .get();
  return row ? mapSession(row) : null;
}

export function getCashSessionStatus(db: EdgeDatabase): CashSessionStatusPayload {
  const open = getOpenCashSession(db);
  return {
    open: open != null,
    session: open
      ? {
          id: open.id,
          service: open.service,
          businessDate: open.businessDate,
          openedAt: open.openedAt,
          openedByName: open.openedByName,
        }
      : null,
    suggestedOpeningFund: getLastClosedSession(db)?.closingFundLeft ?? null,
  };
}

/** Da chiamare dopo ogni apertura/chiusura: palmari e cassa aggiornano l'avviso. */
export function broadcastCashSessionStatus(db: EdgeDatabase) {
  broadcast({
    type: "CASH_SESSION_STATUS",
    payload: getCashSessionStatus(db),
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });
}

/**
 * Data contabile corrente: quella della sessione aperta; altrimenti quella dell'ultima
 * sessione se la giornata non è ancora stata chiusa (chiusura Z dopo mezzanotte).
 */
export function currentBusinessDate(db: EdgeDatabase, now = new Date()): string {
  const open = getOpenCashSession(db);
  if (open) return open.businessDate;
  const last = db.select().from(cashSessions).orderBy(desc(cashSessions.openedAt)).get();
  if (last) {
    const closed = db
      .select({ id: closureArchive.id })
      .from(closureArchive)
      .where(eq(closureArchive.closureDate, last.businessDate))
      .get();
    if (!closed) return last.businessDate;
  }
  return localDateKey(now);
}

/** Servizio proposto all'apertura: pranzo fino alle 16, poi cena. */
export function suggestCashService(now = new Date()): CashService {
  return now.getHours() < 16 ? "LUNCH" : "DINNER";
}

/** Soglia oltre cui la nota di chiusura è obbligatoria (D5): configurata dal Cloud per sede. */
export function getDiscrepancyNoteThreshold(db: EdgeDatabase): number {
  const settings = (getMenuSnapshot(db)?.snapshot as { settings?: { cashDiscrepancyThreshold?: number } })
    ?.settings;
  const value = Number(settings?.cashDiscrepancyThreshold);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CASH_DISCREPANCY_NOTE_THRESHOLD;
}

// ── Autorizzazione ───────────────────────────────────────────────────────────

/** Solo l'operatore cassa (Cassiere o Admin di sede) apre, movimenta e chiude la cassa. */
export async function authorizeCashOperator(db: EdgeDatabase, pin: string): Promise<VerifiedStaff> {
  const member = await verifyPin(db, pin);
  if (!member) throw new CashSessionError("PIN errato", 401, "INVALID_PIN");
  if (!isCashOperatorRole(member.role)) {
    throw new CashSessionError(
      "Solo l'operatore cassa può aprire, movimentare e chiudere la cassa",
      403,
      "CASH_ROLE_REQUIRED",
    );
  }
  return member;
}

function staffName(member: VerifiedStaff) {
  return `${member.firstName} ${member.lastName}`.trim();
}

// ── Apertura e movimenti ─────────────────────────────────────────────────────

export function openCashSession(
  db: EdgeDatabase,
  params: {
    operator: VerifiedStaff;
    service: CashService;
    openingFund: number;
    openingFundBreakdown?: CashBreakdown;
    now?: Date;
  },
): CashSession {
  const now = params.now ?? new Date();
  const open = getOpenCashSession(db);
  if (open) {
    throw new CashSessionError("La cassa è già aperta", 409, "CASH_SESSION_ALREADY_OPEN");
  }
  const businessDate = localDateKey(now);
  const existing = db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.businessDate, businessDate), eq(cashSessions.service, params.service)))
    .get();
  if (existing) {
    throw new CashSessionError(
      `Il servizio ${params.service === "LUNCH" ? "pranzo" : "cena"} di oggi è già stato chiuso`,
      409,
      "CASH_SERVICE_ALREADY_USED",
    );
  }

  const row = {
    id: randomUUID(),
    businessDate,
    service: params.service,
    status: "OPEN" as const,
    openedByStaffId: params.operator.id,
    openedByName: staffName(params.operator),
    openedAt: now.toISOString(),
    openingFund: round2(params.openingFund),
    openingFundBreakdown: params.openingFundBreakdown
      ? JSON.stringify(params.openingFundBreakdown)
      : null,
  };
  db.insert(cashSessions).values(row).run();
  return getCashSession(db, row.id)!;
}

function requireOpenSession(db: EdgeDatabase, sessionId: string): CashSession {
  const session = getCashSession(db, sessionId);
  if (!session) throw new CashSessionError("Sessione di cassa non trovata", 404, "NOT_FOUND");
  if (session.status !== "OPEN") {
    throw new CashSessionError("La sessione di cassa è già chiusa", 409, "CASH_SESSION_CLOSED");
  }
  return session;
}

export function addCashMovement(
  db: EdgeDatabase,
  params: {
    sessionId: string;
    operator: VerifiedStaff;
    type: CashMovementType;
    amount: number;
    reason?: string;
  },
): CashMovement {
  requireOpenSession(db, params.sessionId);
  const row = {
    id: randomUUID(),
    sessionId: params.sessionId,
    type: params.type,
    amount: round2(params.amount),
    reason: params.reason?.trim() || null,
    staffId: params.operator.id,
    staffName: staffName(params.operator),
    createdAt: new Date().toISOString(),
  };
  db.insert(cashMovements).values(row).run();
  return mapMovement(row);
}

export function deleteCashMovement(db: EdgeDatabase, sessionId: string, movementId: string) {
  requireOpenSession(db, sessionId);
  const deleted = db
    .delete(cashMovements)
    .where(and(eq(cashMovements.id, movementId), eq(cashMovements.sessionId, sessionId)))
    .returning()
    .get();
  if (!deleted) throw new CashSessionError("Movimento non trovato", 404, "NOT_FOUND");
  return mapMovement(deleted);
}

export function listCashMovements(db: EdgeDatabase, sessionId: string): CashMovement[] {
  return db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId))
    .orderBy(asc(cashMovements.createdAt))
    .all()
    .map(mapMovement);
}

// ── Calcoli ──────────────────────────────────────────────────────────────────

/** Incassi della sessione dai documenti emessi (annullati e training esclusi) + movimenti. */
export function computeCashSessionTheoretical(
  db: EdgeDatabase,
  session: Pick<CashSession, "id" | "openingFund">,
): CashSessionTheoretical {
  const docs = db
    .select({
      total: fiscalDocuments.total,
      paymentMethod: fiscalDocuments.paymentMethod,
      metaJson: fiscalDocuments.metaJson,
    })
    .from(fiscalDocuments)
    .where(
      and(
        eq(fiscalDocuments.cashSessionId, session.id),
        eq(fiscalDocuments.status, "ISSUED"),
        ne(fiscalDocuments.documentType, "TRAINING"),
      ),
    )
    .all();

  const byPaymentMethod: Record<string, number> = {};
  let totalSales = 0;
  for (const doc of docs) {
    const splits = parseJson<{ paymentSplits?: PaymentSplit[] }>(doc.metaJson)?.paymentSplits;
    const parts =
      splits && splits.length > 1
        ? splits.map((s) => ({ method: s.paymentMethod as string, amount: s.amount }))
        : [{ method: doc.paymentMethod, amount: doc.total }];
    for (const part of parts) {
      byPaymentMethod[part.method] = round2((byPaymentMethod[part.method] ?? 0) + part.amount);
    }
    totalSales += doc.total;
  }

  const movements = listCashMovements(db, session.id);
  const sumOf = (type: CashMovementType) =>
    round2(movements.filter((m) => m.type === type).reduce((s, m) => s + m.amount, 0));
  const withdrawals = sumOf("WITHDRAWAL");
  const deposits = sumOf("DEPOSIT");
  const expenses = sumOf("EXPENSE");
  const cashSales = byPaymentMethod.CASH ?? 0;

  return {
    byPaymentMethod,
    cashSales,
    posSales: byPaymentMethod.POS ?? 0,
    totalSales: round2(totalSales),
    documentCount: docs.length,
    withdrawals,
    deposits,
    expenses,
    openingFund: session.openingFund,
    expectedCash: round2(session.openingFund + cashSales + deposits - withdrawals - expenses),
  };
}

export function buildCashSessionSummary(db: EdgeDatabase, sessionId: string): CashSessionSummary {
  const session = getCashSession(db, sessionId);
  if (!session) throw new CashSessionError("Sessione di cassa non trovata", 404, "NOT_FOUND");
  const theoretical =
    session.status === "CLOSED" && session.theoretical
      ? session.theoretical
      : computeCashSessionTheoretical(db, session);
  const pendingPayments = getPendingPaymentRequests().map((p) => ({
    requestId: p.id,
    tableLabel: p.tableLabel,
    total: p.total,
  }));
  const openTables = getAllTableRuntime()
    .filter((t) => t.status !== "FREE")
    .map((t) => ({ tableId: t.tableId, status: t.status }));

  return {
    session,
    movements: listCashMovements(db, sessionId),
    theoretical,
    pendingPayments,
    openTables,
    canClose: session.status === "OPEN" && pendingPayments.length === 0,
    discrepancyNoteThreshold: getDiscrepancyNoteThreshold(db),
  };
}

// ── Chiusura ─────────────────────────────────────────────────────────────────

export function closeCashSession(
  db: EdgeDatabase,
  params: {
    sessionId: string;
    operator: VerifiedStaff;
    countedCash: number;
    countedCashBreakdown?: CashBreakdown;
    posDeclared: number;
    closingFundLeft: number;
    notes?: string;
  },
): CashSession {
  const session = requireOpenSession(db, params.sessionId);

  // D3: i conti in attesa di pagamento bloccano; i tavoli aperti passano alla sessione successiva.
  const pending = getPendingPaymentRequests();
  if (pending.length > 0) {
    throw new CashSessionError(
      `${pending.length} conto/i in attesa di pagamento: incassa o rifiuta prima di chiudere`,
      409,
      "PENDING_PAYMENTS",
    );
  }

  const countedCash = round2(params.countedCash);
  if (params.closingFundLeft > countedCash + 0.001) {
    throw new CashSessionError(
      "Il fondo lasciato in cassa non può superare i contanti contati",
      400,
      "INVALID_CLOSING_FUND",
    );
  }

  const theoretical = computeCashSessionTheoretical(db, session);
  const discrepancyCash = round2(countedCash - theoretical.expectedCash);
  const discrepancyPos = round2(params.posDeclared - theoretical.posSales);
  const notes = params.notes?.trim() || null;
  const threshold = getDiscrepancyNoteThreshold(db);
  if ((Math.abs(discrepancyCash) > threshold || Math.abs(discrepancyPos) > threshold) && !notes) {
    throw new CashSessionError(
      `Scostamento oltre €${threshold}: la nota è obbligatoria`,
      400,
      "NOTE_REQUIRED",
    );
  }

  db.update(cashSessions)
    .set({
      status: "CLOSED",
      closedByStaffId: params.operator.id,
      closedByName: staffName(params.operator),
      closedAt: new Date().toISOString(),
      countedCash,
      countedCashBreakdown: params.countedCashBreakdown
        ? JSON.stringify(params.countedCashBreakdown)
        : null,
      posDeclared: round2(params.posDeclared),
      closingFundLeft: round2(params.closingFundLeft),
      theoreticalJson: JSON.stringify(theoretical),
      discrepancyCash,
      discrepancyPos,
      notes,
    })
    .where(eq(cashSessions.id, session.id))
    .run();

  return getCashSession(db, session.id)!;
}

export function setCashSessionReportPath(db: EdgeDatabase, id: string, reportPath: string) {
  db.update(cashSessions).set({ reportPath }).where(eq(cashSessions.id, id)).run();
}

export function markCashSessionSynced(db: EdgeDatabase, id: string) {
  db.update(cashSessions)
    .set({ syncedAt: new Date().toISOString() })
    .where(eq(cashSessions.id, id))
    .run();
}

export function listCashSessions(
  db: EdgeDatabase,
  filters: { from?: string; to?: string; businessDate?: string } = {},
): CashSession[] {
  const conditions = [];
  if (filters.businessDate) conditions.push(eq(cashSessions.businessDate, filters.businessDate));
  if (filters.from) conditions.push(gte(cashSessions.businessDate, filters.from));
  if (filters.to) conditions.push(lte(cashSessions.businessDate, filters.to));
  return db
    .select()
    .from(cashSessions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(cashSessions.openedAt))
    .all()
    .map(mapSession);
}

/** Riepilogo della giornata per la chiusura Z: somma delle sessioni chiuse. */
export function summarizeBusinessDay(db: EdgeDatabase, businessDate: string) {
  const sessions = listCashSessions(db, { businessDate }).filter((s) => s.status === "CLOSED");
  const sum = (pick: (s: CashSession) => number | null | undefined) =>
    round2(sessions.reduce((acc, s) => acc + (pick(s) ?? 0), 0));
  const cashSales = sum((s) => s.theoretical?.cashSales);
  const posSales = sum((s) => s.theoretical?.posSales);
  const discrepancyCash = sum((s) => s.discrepancyCash);
  const discrepancyPos = sum((s) => s.discrepancyPos);
  return {
    sessions,
    cashSales,
    posSales,
    withdrawals: sum((s) => s.theoretical?.withdrawals),
    expenses: sum((s) => s.theoretical?.expenses),
    /** Contanti "dichiarati" della giornata: incassato teorico + scostamenti delle sessioni. */
    cashDeclared: round2(cashSales + discrepancyCash),
    posDeclared: sum((s) => s.posDeclared),
    discrepancyCash,
    discrepancyPos,
    discrepancyTotal: round2(discrepancyCash + discrepancyPos),
    openingFund: sessions.length
      ? [...sessions].sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0]!.openingFund
      : 0,
    closingFundLeft: sessions.length
      ? [...sessions].sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0]!.closingFundLeft ?? 0
      : 0,
  };
}

export function staffDisplayName(member: VerifiedStaff) {
  return staffName(member);
}
