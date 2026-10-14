import { edgeState } from "@pizzaguys/edge-db";
import {
  cashMovementSchema,
  closeCashSessionSchema,
  deleteCashMovementSchema,
  openCashSessionSchema,
} from "@pizzaguys/validators";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { writeEdgeAudit } from "../lib/audit.js";
import {
  addCashMovement,
  authorizeCashOperator,
  broadcastCashSessionStatus,
  buildCashSessionSummary,
  CashSessionError,
  closeCashSession,
  deleteCashMovement,
  getCashSessionStatus,
  getOpenCashSession,
  listCashMovements,
  listCashSessions,
  openCashSession,
  setCashSessionReportPath,
  suggestCashService,
} from "../lib/cash-session.js";
import { writeAndPrintCashSessionReport } from "../lib/cash-session-report.js";
import { enqueueCashSessionSync } from "../lib/sync-queue.js";

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof CashSessionError) {
    return reply.status(err.status).send({ error: err.message, code: err.code });
  }
  throw err;
}

export async function cashSessionRoutes(app: FastifyInstance) {
  app.get("/api/cash-sessions/current", async () => {
    const status = getCashSessionStatus(app.edgeDb);
    return { ...status, suggestedService: suggestCashService(new Date(), status.usedServicesToday) };
  });

  app.get<{ Querystring: { from?: string; to?: string; businessDate?: string } }>(
    "/api/cash-sessions",
    async (req) => listCashSessions(app.edgeDb, req.query),
  );

  app.get<{ Params: { id: string } }>("/api/cash-sessions/:id/summary", async (req, reply) => {
    try {
      return buildCashSessionSummary(app.edgeDb, req.params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/api/cash-sessions/open", async (req, reply) => {
    const parsed = openCashSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    try {
      const operator = await authorizeCashOperator(app.edgeDb, parsed.data.pin);
      const status = getCashSessionStatus(app.edgeDb);
      const session = openCashSession(app.edgeDb, {
        operator,
        service: parsed.data.service,
        openingFund: parsed.data.openingFund,
        openingFundBreakdown: parsed.data.openingFundBreakdown,
      });
      const fundDifference =
        status.suggestedOpeningFund != null
          ? Math.round((session.openingFund - status.suggestedOpeningFund) * 100) / 100
          : 0;
      writeEdgeAudit(app.edgeDb, {
        staffId: operator.id,
        operation: "CASH_SESSION_OPENED",
        severity: fundDifference !== 0 ? "WARNING" : "INFO",
        nextState: {
          sessionId: session.id,
          service: session.service,
          businessDate: session.businessDate,
          openingFund: session.openingFund,
          previousFundLeft: status.suggestedOpeningFund,
          fundDifference,
        },
      });
      broadcastCashSessionStatus(app.edgeDb);
      return reply.status(201).send(session);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<{ Params: { id: string } }>("/api/cash-sessions/:id/movements", async (req, reply) => {
    const parsed = cashMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    try {
      const operator = await authorizeCashOperator(app.edgeDb, parsed.data.pin);
      const movement = addCashMovement(app.edgeDb, {
        sessionId: req.params.id,
        operator,
        type: parsed.data.type,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
      });
      writeEdgeAudit(app.edgeDb, {
        staffId: operator.id,
        operation: "CASH_MOVEMENT_ADDED",
        severity: "INFO",
        nextState: movement,
      });
      return reply.status(201).send(movement);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete<{ Params: { id: string; movementId: string } }>(
    "/api/cash-sessions/:id/movements/:movementId",
    async (req, reply) => {
      const parsed = deleteCashMovementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "PIN obbligatorio" });
      }
      try {
        const operator = await authorizeCashOperator(app.edgeDb, parsed.data.pin);
        const removed = deleteCashMovement(app.edgeDb, req.params.id, req.params.movementId);
        writeEdgeAudit(app.edgeDb, {
          staffId: operator.id,
          operation: "CASH_MOVEMENT_REMOVED",
          severity: "WARNING",
          previousState: removed,
        });
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string } }>("/api/cash-sessions/:id/close", async (req, reply) => {
    const parsed = closeCashSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    try {
      const operator = await authorizeCashOperator(app.edgeDb, parsed.data.pin);
      const session = closeCashSession(app.edgeDb, {
        sessionId: req.params.id,
        operator,
        countedCash: parsed.data.countedCash,
        countedCashBreakdown: parsed.data.countedCashBreakdown,
        posDeclared: parsed.data.posDeclared,
        closingFundLeft: parsed.data.closingFundLeft,
        notes: parsed.data.notes,
      });
      const movements = listCashMovements(app.edgeDb, session.id);

      writeEdgeAudit(app.edgeDb, {
        staffId: operator.id,
        operation: "CASH_SESSION_CLOSED",
        severity:
          (session.discrepancyCash ?? 0) !== 0 || (session.discrepancyPos ?? 0) !== 0
            ? "WARNING"
            : "INFO",
        nextState: {
          sessionId: session.id,
          service: session.service,
          businessDate: session.businessDate,
          expectedCash: session.theoretical?.expectedCash,
          countedCash: session.countedCash,
          discrepancyCash: session.discrepancyCash,
          discrepancyPos: session.discrepancyPos,
        },
      });
      broadcastCashSessionStatus(app.edgeDb);

      const report = await writeAndPrintCashSessionReport(app.edgeDb, session, movements);
      setCashSessionReportPath(app.edgeDb, session.id, report.reportPath);

      const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
      const synced = state?.locationId
        ? await enqueueCashSessionSync(app.edgeDb, {
            locationId: state.locationId,
            session,
            movements,
          })
        : false;

      return {
        ok: true,
        session,
        movements,
        reportPath: report.reportPath,
        printMessages: report.printMessages,
        synced,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /** Ristampa del report di una sessione chiusa. */
  app.post<{ Params: { id: string } }>("/api/cash-sessions/:id/print", async (req, reply) => {
    const session = listCashSessions(app.edgeDb).find((s) => s.id === req.params.id);
    if (!session) return reply.status(404).send({ error: "Sessione non trovata" });
    if (session.status !== "CLOSED") {
      return reply.status(409).send({ error: "La sessione è ancora aperta" });
    }
    const report = await writeAndPrintCashSessionReport(
      app.edgeDb,
      session,
      listCashMovements(app.edgeDb, session.id),
    );
    return { ok: true, reportPath: report.reportPath, printMessages: report.printMessages };
  });

  app.get("/api/cash-sessions/open/summary", async (_req, reply) => {
    const open = getOpenCashSession(app.edgeDb);
    if (!open) return reply.status(404).send({ error: "Nessuna sessione di cassa aperta" });
    return buildCashSessionSummary(app.edgeDb, open.id);
  });
}
