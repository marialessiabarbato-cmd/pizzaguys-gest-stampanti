import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, fiscalDocuments, menuCache, staff, type EdgeDatabase } from "@pizzaguys/edge-db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addCashMovement,
  authorizeCashOperator,
  buildCashSessionSummary,
  CASH_SESSION_CLOSED,
  CashSessionError,
  closeCashSession,
  computeCashSessionTheoretical,
  currentBusinessDate,
  deleteCashMovement,
  getCashSessionStatus,
  isCashSessionOpen,
  openCashSession,
  suggestCashService,
  summarizeBusinessDay,
} from "./cash-session.js";
import { localDateKey } from "./business-date.js";
import { persistFiscalDocument } from "./fiscal-document-archive.js";
import { endAllOperatorShifts, endOperatorShift, startOperatorShift } from "./operator-shifts.js";
import { executeTablePayment } from "./payment.js";
import { createPaymentRequest, rejectPaymentRequest } from "./runtime.js";
import type { VerifiedStaff } from "./staff-auth.js";

let dir: string;
let db: EdgeDatabase;

const CASHIER: VerifiedStaff = { id: "cassa-1", firstName: "Anna", lastName: "Cassa", role: "CASHIER" };
const ADMIN: VerifiedStaff = { id: "admin-1", firstName: "Test", lastName: "Admin", role: "USER_ADMIN" };
const WAITER: VerifiedStaff = { id: "cam-1", firstName: "Marco", lastName: "Sala", role: "WAITER" };

function addStaff(member: VerifiedStaff, pin: string) {
  const now = new Date().toISOString();
  db.insert(staff)
    .values({
      ...member,
      role: member.role as "CASHIER" | "USER_ADMIN" | "WAITER",
      pinHash: bcrypt.hashSync(pin, 4),
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

let docSeq = 0;
function addDocument(
  sessionId: string,
  params: {
    total: number;
    paymentMethod: "CASH" | "POS" | "MEAL_VOUCHER";
    splits?: Array<{ paymentMethod: "CASH" | "POS"; amount: number }>;
    documentType?: "RECEIPT" | "TRAINING";
  },
) {
  docSeq += 1;
  return persistFiscalDocument(db, {
    receipt: {
      id: `doc-${docSeq}`,
      locationId: "loc",
      tableId: "t1",
      paymentMethod: params.paymentMethod,
      documentType: params.documentType ?? "RECEIPT",
      lines: [],
      total: params.total,
      issuedAt: new Date().toISOString(),
    } as never,
    meta: params.splits ? { paymentSplits: params.splits } : undefined,
    cashSessionId: sessionId,
  });
}

function closeWith(sessionId: string, overrides: Partial<Parameters<typeof closeCashSession>[1]> = {}) {
  return closeCashSession(db, {
    sessionId,
    operator: CASHIER,
    countedCash: 0,
    posDeclared: 0,
    closingFundLeft: 0,
    ...overrides,
  });
}

function expectCashError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CashSessionError);
    expect((err as CashSessionError).code).toBe(code);
    return;
  }
  throw new Error(`Atteso errore ${code}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-cash-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  addStaff(CASHIER, "1111");
  addStaff(ADMIN, "2222");
  addStaff(WAITER, "3333");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("blocco del locale", () => {
  it("senza sessione aperta la cassa è chiusa", () => {
    expect(isCashSessionOpen(db)).toBe(false);
    expect(getCashSessionStatus(db)).toMatchObject({ open: false, session: null });
  });

  it("un turno operatore aperto non sblocca il locale", () => {
    startOperatorShift(db, WAITER.id);
    expect(isCashSessionOpen(db)).toBe(false);
  });

  it("l'incasso è rifiutato a cassa chiusa, prima di ogni altro controllo", async () => {
    const result = await executeTablePayment({
      edgeDb: db,
      tableId: "tavolo-inesistente",
      locationId: "loc",
      paymentMethod: "CASH",
      splitMode: "FULL",
      operatorId: CASHIER.id,
      operatorName: "Anna Cassa",
      tableLabel: "T1",
    });
    expect(result).toEqual({ ok: false, ...CASH_SESSION_CLOSED, status: 409 });
  });

  it("si sblocca all'apertura e si riblocca alla chiusura", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    expect(getCashSessionStatus(db)).toMatchObject({
      open: true,
      session: { id: session.id, service: "LUNCH", openedByName: "Anna Cassa" },
    });
    closeWith(session.id, { countedCash: 100, closingFundLeft: 100 });
    expect(isCashSessionOpen(db)).toBe(false);
  });
});

describe("autorizzazione operatore cassa (D1)", () => {
  it("accetta Cassiere e Admin di sede", async () => {
    await expect(authorizeCashOperator(db, "1111")).resolves.toMatchObject({ id: CASHIER.id });
    await expect(authorizeCashOperator(db, "2222")).resolves.toMatchObject({ id: ADMIN.id });
  });

  it("rifiuta i camerieri con 403", async () => {
    await expect(authorizeCashOperator(db, "3333")).rejects.toMatchObject({
      status: 403,
      code: "CASH_ROLE_REQUIRED",
    });
  });

  it("rifiuta un PIN errato con 401", async () => {
    await expect(authorizeCashOperator(db, "9999")).rejects.toMatchObject({ status: 401 });
  });
});

describe("apertura", () => {
  it("una sola sessione aperta alla volta", () => {
    openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    expectCashError(
      () => openCashSession(db, { operator: ADMIN, service: "DINNER", openingFund: 100 }),
      "CASH_SESSION_ALREADY_OPEN",
    );
  });

  it("un servizio già chiuso oggi non si riapre", () => {
    const lunch = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    closeWith(lunch.id, { countedCash: 100, closingFundLeft: 100 });
    expectCashError(
      () => openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 }),
      "CASH_SERVICE_ALREADY_USED",
    );
    expect(openCashSession(db, { operator: CASHIER, service: "DINNER", openingFund: 100 }).service).toBe(
      "DINNER",
    );
  });

  it("dopo la chiusura del pranzo propone la cena anche prima delle 16", () => {
    const lunch = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    closeWith(lunch.id, { countedCash: 100, closingFundLeft: 100 });
    const status = getCashSessionStatus(db);
    expect(status.usedServicesToday).toEqual(["LUNCH"]);
    expect(suggestCashService(new Date(2026, 9, 14, 15, 30), status.usedServicesToday)).toBe("DINNER");
  });

  it("propone come fondo quello lasciato dalla sessione precedente", () => {
    const lunch = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 150 });
    closeWith(lunch.id, { countedCash: 150, closingFundLeft: 120, notes: "versati 30 in banca" });
    expect(getCashSessionStatus(db).suggestedOpeningFund).toBe(120);
  });

  it("usa la data contabile locale", () => {
    const now = new Date(2026, 0, 15, 0, 30); // 15 gennaio, 00:30 ora locale
    const session = openCashSession(db, { operator: CASHIER, service: "DINNER", openingFund: 0, now });
    expect(session.businessDate).toBe("2026-01-15");
  });
});

describe("calcolo dei contanti attesi", () => {
  it("fondo + contanti + versamenti − prelievi − spese; esclusi annullati e training", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    addDocument(session.id, { total: 30, paymentMethod: "CASH" });
    addDocument(session.id, { total: 20, paymentMethod: "POS" });
    addDocument(session.id, {
      total: 50,
      paymentMethod: "CASH",
      splits: [
        { paymentMethod: "CASH", amount: 10 },
        { paymentMethod: "POS", amount: 40 },
      ],
    });
    const voided = addDocument(session.id, { total: 99, paymentMethod: "CASH" });
    db.update(fiscalDocuments).set({ status: "VOIDED" }).where(eq(fiscalDocuments.id, voided.id)).run();
    addDocument(session.id, { total: 77, paymentMethod: "CASH", documentType: "TRAINING" });
    addDocument("altra-sessione", { total: 500, paymentMethod: "CASH" });

    addCashMovement(db, { sessionId: session.id, operator: CASHIER, type: "WITHDRAWAL", amount: 25 });
    addCashMovement(db, { sessionId: session.id, operator: CASHIER, type: "EXPENSE", amount: 5, reason: "Ghiaccio" });
    addCashMovement(db, { sessionId: session.id, operator: CASHIER, type: "DEPOSIT", amount: 10 });

    expect(computeCashSessionTheoretical(db, session)).toMatchObject({
      byPaymentMethod: { CASH: 40, POS: 60 },
      cashSales: 40,
      posSales: 60,
      totalSales: 100,
      documentCount: 3,
      withdrawals: 25,
      expenses: 5,
      deposits: 10,
      expectedCash: 120, // 100 + 40 + 10 − 25 − 5
    });
  });

  it("un movimento si può togliere solo a cassa aperta", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 0 });
    const m = addCashMovement(db, { sessionId: session.id, operator: CASHIER, type: "WITHDRAWAL", amount: 5 });
    deleteCashMovement(db, session.id, m.id);
    expect(computeCashSessionTheoretical(db, session).withdrawals).toBe(0);
    const m2 = addCashMovement(db, { sessionId: session.id, operator: CASHIER, type: "WITHDRAWAL", amount: 5 });
    closeWith(session.id, { countedCash: 0, notes: "test" });
    expectCashError(() => deleteCashMovement(db, session.id, m2.id), "CASH_SESSION_CLOSED");
  });
});

describe("chiusura", () => {
  it("calcola ammanco ed eccedenza e congela i totali", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "DINNER", openingFund: 100 });
    addDocument(session.id, { total: 50, paymentMethod: "CASH" });
    addDocument(session.id, { total: 80, paymentMethod: "POS" });

    const closed = closeWith(session.id, { countedCash: 148, posDeclared: 81, closingFundLeft: 100 });
    expect(closed).toMatchObject({
      status: "CLOSED",
      closedByName: "Anna Cassa",
      discrepancyCash: -2, // ammanco
      discrepancyPos: 1, // eccedenza
      theoretical: { expectedCash: 150, posSales: 80 },
    });

    // Un documento arrivato dopo non cambia la sessione chiusa.
    addDocument(session.id, { total: 999, paymentMethod: "CASH" });
    expect(buildCashSessionSummary(db, session.id).theoretical.expectedCash).toBe(150);
  });

  it("la nota è obbligatoria sopra €5 di scostamento (D5)", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    expectCashError(() => closeWith(session.id, { countedCash: 90 }), "NOTE_REQUIRED");
    expect(closeWith(session.id, { countedCash: 90, notes: "resto sbagliato" }).discrepancyCash).toBe(-10);
  });

  it("la soglia della nota arriva dalle impostazioni della sede (Cloud)", () => {
    db.insert(menuCache)
      .values({
        id: 1,
        schemaVersion: 1,
        payload: JSON.stringify({ settings: { cashDiscrepancyThreshold: 20 } }),
        updatedAt: new Date().toISOString(),
      })
      .run();
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    expect(buildCashSessionSummary(db, session.id).discrepancyNoteThreshold).toBe(20);
    expect(closeWith(session.id, { countedCash: 90 }).discrepancyCash).toBe(-10);
  });

  it("il fondo lasciato non può superare il contato", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    expectCashError(
      () => closeWith(session.id, { countedCash: 100, closingFundLeft: 150 }),
      "INVALID_CLOSING_FUND",
    );
  });

  it("i conti in attesa di pagamento bloccano, i tavoli aperti no (D3)", () => {
    const session = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 0 });
    const request = createPaymentRequest({
      tableId: "t9",
      tableLabel: "9",
      operatorId: WAITER.id,
      operatorName: "Marco",
      total: 12,
    });
    expect(buildCashSessionSummary(db, session.id).canClose).toBe(false);
    expectCashError(() => closeWith(session.id), "PENDING_PAYMENTS");
    rejectPaymentRequest(request.id);
    expect(buildCashSessionSummary(db, session.id).canClose).toBe(true);
    expect(closeWith(session.id).status).toBe("CLOSED");
  });
});

describe("giornata", () => {
  it("somma pranzo e cena per la chiusura giornaliera", () => {
    const lunch = openCashSession(db, { operator: CASHIER, service: "LUNCH", openingFund: 100 });
    addDocument(lunch.id, { total: 40, paymentMethod: "CASH" });
    addDocument(lunch.id, { total: 60, paymentMethod: "POS" });
    closeWith(lunch.id, { countedCash: 139, posDeclared: 60, closingFundLeft: 120 });

    const dinner = openCashSession(db, { operator: ADMIN, service: "DINNER", openingFund: 120 });
    addDocument(dinner.id, { total: 100, paymentMethod: "CASH" });
    addCashMovement(db, { sessionId: dinner.id, operator: ADMIN, type: "WITHDRAWAL", amount: 50 });
    closeWith(dinner.id, { countedCash: 172, posDeclared: 0, closingFundLeft: 150 });

    const day = summarizeBusinessDay(db, localDateKey());
    expect(day).toMatchObject({
      cashSales: 140,
      posSales: 60,
      withdrawals: 50,
      discrepancyCash: 1, // −1 a pranzo, +2 a cena
      discrepancyPos: 0,
      cashDeclared: 141,
      posDeclared: 60,
      openingFund: 100,
      closingFundLeft: 150,
    });
    expect(day.sessions).toHaveLength(2);
  });

  it("dopo mezzanotte la giornata da chiudere resta quella della sessione", () => {
    const session = openCashSession(db, {
      operator: CASHIER,
      service: "DINNER",
      openingFund: 0,
      now: new Date(2026, 0, 15, 19, 0),
    });
    closeWith(session.id);
    expect(currentBusinessDate(db, new Date(2026, 0, 16, 1, 30))).toBe("2026-01-15");
  });
});

describe("turni operatore (D6)", () => {
  it("avvio idempotente: un solo turno aperto per operatore", () => {
    const first = startOperatorShift(db, WAITER.id);
    const again = startOperatorShift(db, WAITER.id);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, shift: { id: first.shift.id } });
  });

  it("un cameriere non chiude il turno di un altro; l'operatore cassa sì", () => {
    const { shift } = startOperatorShift(db, ADMIN.id);
    expect(endOperatorShift(db, shift.id, WAITER)).toMatchObject({ ok: false, status: 403 });
    expect(endOperatorShift(db, shift.id, CASHIER)).toMatchObject({ ok: true });
  });

  it("a fine giornata si chiudono tutti", () => {
    startOperatorShift(db, WAITER.id);
    startOperatorShift(db, CASHIER.id);
    expect(endAllOperatorShifts(db)).toBe(2);
  });
});

describe("servizio proposto", () => {
  const morning = new Date(2026, 9, 14, 11, 0);
  const evening = new Date(2026, 9, 14, 19, 0);

  it("in base all'ora se nessun servizio è stato usato", () => {
    expect(suggestCashService(morning)).toBe("LUNCH");
    expect(suggestCashService(evening)).toBe("DINNER");
  });

  it("salta il servizio già usato oggi", () => {
    expect(suggestCashService(morning, ["LUNCH"])).toBe("DINNER");
    expect(suggestCashService(evening, ["DINNER"])).toBe("LUNCH");
  });

  it("con entrambi i servizi usati resta sull'ora (l'apertura verrà rifiutata)", () => {
    expect(suggestCashService(morning, ["LUNCH", "DINNER"])).toBe("LUNCH");
  });
});
