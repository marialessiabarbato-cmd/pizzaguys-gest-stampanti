import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { edgeState, staffShifts, tables } from "@pizzaguys/edge-db";
import { closureCompleteSchema, closureReconcileSchema } from "@pizzaguys/validators";
import { eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { writeEdgeAudit } from "../lib/audit.js";
import {
  buildClosureCsv,
  listClosureArchive,
  persistClosureArchive,
  updateClosureSyncedAt,
} from "../lib/closure-archive.js";
import { cloudDailyClosure } from "../lib/cloud.js";
import { enqueueDailyClosureSync } from "../lib/sync-queue.js";
import {
  getLastClosure,
  getZReportToday,
  resetClosureSession,
  saveClosure,
  setZReportToday,
  type DailyClosureRecord,
} from "../lib/closure-state.js";
import {
  clearDayLedger,
  clearShiftLedger,
} from "../lib/shift-ledger.js";
import {
  clearTableOrders,
  getAllTableRuntime,
  getPendingPaymentRequests,
  setTableFree,
} from "../lib/runtime.js";
import {
  buildByChannelFromSnapshot,
  buildDailyReportSnapshot,
  clearDayReportLedger,
  getDayTheoretical,
} from "../lib/day-report-ledger.js";
import { formatDailyReportHtml, formatDailyReportText } from "../lib/daily-report-format.js";
import { broadcastTableStatus } from "../lib/ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function writeDailyReportFiles(
  app: FastifyInstance,
  params: { printedBy: string; zNumber?: number; closureDate?: string },
) {
  const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
  const closureDate = params.closureDate ?? todayKey();
  const snapshot = buildDailyReportSnapshot(app.edgeDb, {
    locationName: state?.locationName ?? "Pizza Guys",
    closureDate,
    printedBy: params.printedBy,
    zNumber: params.zNumber,
  });

  await mkdir(PRINT_DIR, { recursive: true });
  const stamp = Date.now();
  const base = `${stamp}-daily-report-${closureDate}`;
  const txtPath = join(PRINT_DIR, `${base}.txt`);
  const htmlPath = join(PRINT_DIR, `${base}.html`);
  const jsonPath = join(PRINT_DIR, `${base}.json`);
  await writeFile(txtPath, formatDailyReportText(snapshot), "utf8");
  await writeFile(htmlPath, formatDailyReportHtml(snapshot), "utf8");
  await writeFile(jsonPath, JSON.stringify(snapshot, null, 2));

  return { snapshot, txtPath, htmlPath, jsonPath };
}

export async function closureRoutes(app: FastifyInstance) {
  app.get("/api/closure/pre-check", async () => {
    const openTables = getAllTableRuntime().filter(
      (t) => !["FREE", "LOCKED"].includes(t.status),
    );
    const pendingPayments = getPendingPaymentRequests();
    const openShifts = app.edgeDb
      .select()
      .from(staffShifts)
      .where(isNull(staffShifts.endedAt))
      .all();

    const blockers: string[] = [];
    if (openTables.length > 0) {
      blockers.push(`${openTables.length} tavolo/i con conto aperto`);
    }
    if (pendingPayments.length > 0) {
      blockers.push(`${pendingPayments.length} richiesta/e pagamento pendente`);
    }
    if (openShifts.length > 0) {
      blockers.push(`${openShifts.length} turno/i cassa ancora aperti`);
    }

    return {
      canClose: blockers.length === 0,
      blockers,
      openTables: openTables.map((t) => ({ tableId: t.tableId, status: t.status })),
      pendingPayments: pendingPayments.map((p) => ({
        requestId: p.id,
        tableLabel: p.tableLabel,
        total: p.total,
      })),
      openShifts: openShifts.map((s) => ({ id: s.id, staffId: s.staffId })),
      zReportIssued: getZReportToday() != null,
      theoretical: getDayTheoretical(app.edgeDb),
    };
  });

  app.post("/api/closure/z-report", async (req, reply) => {
    const pre = await app.inject({ method: "GET", url: "/api/closure/pre-check" });
    const check = JSON.parse(pre.body) as { canClose: boolean; blockers: string[] };
    if (!check.canClose) {
      return reply.status(400).send({ error: "Pre-check fallito", blockers: check.blockers });
    }

    const result = await hardware.emitZReport();
    if (!result.success || result.zNumber == null) {
      return reply.status(500).send({ error: result.error ?? "Errore Z-report" });
    }

    setZReportToday(result.zNumber);
    const theoretical = getDayTheoretical(app.edgeDb);
    const dailyReport = await writeDailyReportFiles(app, {
      printedBy: "Cassa",
      zNumber: result.zNumber,
      closureDate: todayKey(),
    });

    writeEdgeAudit(app.edgeDb, {
      operation: "Z_REPORT_ISSUED",
      severity: "INFO",
      nextState: {
        zNumber: result.zNumber,
        date: todayKey(),
        theoretical,
        dailyReportTxt: dailyReport.txtPath,
      },
    });

    await mkdir(PRINT_DIR, { recursive: true });
    const reportPath = join(PRINT_DIR, `${Date.now()}-z-report-${result.zNumber}.json`);
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          mock: true,
          zNumber: result.zNumber,
          date: todayKey(),
          theoretical,
          dailyReport: dailyReport.snapshot,
        },
        null,
        2,
      ),
    );

    return {
      ok: true,
      zNumber: result.zNumber,
      reportPath,
      dailyReportPath: dailyReport.txtPath,
      dailyReportHtml: dailyReport.htmlPath,
      theoretical,
    };
  });

  app.post("/api/closure/reconcile", async (req, reply) => {
    const parsed = closureReconcileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    if (!getZReportToday()) {
      return reply.status(400).send({ error: "Emetti prima la Chiusura Z" });
    }

    const theoretical = getDayTheoretical(app.edgeDb);
    const cashDiscrepancy =
      Math.round((parsed.data.cashDeclared - theoretical.cash) * 100) / 100;
    const posDiscrepancy =
      Math.round((parsed.data.posDeclared - theoretical.pos) * 100) / 100;

    return {
      ok: true,
      theoretical,
      declared: { cash: parsed.data.cashDeclared, pos: parsed.data.posDeclared },
      discrepancy: {
        cash: cashDiscrepancy,
        pos: posDiscrepancy,
        total: Math.round((cashDiscrepancy + posDiscrepancy) * 100) / 100,
      },
    };
  });

  app.get("/api/closure/last", async () => {
    return { closure: getLastClosure() };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/closure/history",
    async (req) => {
      const rows = listClosureArchive(app.edgeDb, {
        from: req.query.from,
        to: req.query.to,
      });
      return { closures: rows };
    },
  );

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/closure/export.csv",
    async (req, reply) => {
      const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
      const rows = listClosureArchive(app.edgeDb, {
        from: req.query.from,
        to: req.query.to,
      });

      writeEdgeAudit(app.edgeDb, {
        operation: "CLOSURE_CSV_EXPORT",
        severity: "INFO",
        nextState: {
          from: req.query.from ?? null,
          to: req.query.to ?? null,
          rowCount: rows.length,
        },
      });

      const csv = buildClosureCsv(rows, state?.locationName ?? undefined);
      const filename = `chiusure-${todayKey()}.csv`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(csv);
    },
  );

  app.get("/api/closure/daily-report", async () => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const z = getZReportToday();
    const snapshot = buildDailyReportSnapshot(app.edgeDb, {
      locationName: state?.locationName ?? "Pizza Guys",
      closureDate: todayKey(),
      printedBy: "Anteprima",
      zNumber: z?.zNumber,
    });
    return { snapshot };
  });

  app.get("/api/closure/daily-report.txt", async (_req, reply) => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const z = getZReportToday();
    const snapshot = buildDailyReportSnapshot(app.edgeDb, {
      locationName: state?.locationName ?? "Pizza Guys",
      closureDate: todayKey(),
      printedBy: "Anteprima",
      zNumber: z?.zNumber,
    });
    return reply
      .header("Content-Type", "text/plain; charset=utf-8")
      .send(formatDailyReportText(snapshot));
  });

  app.get("/api/closure/daily-report.html", async (_req, reply) => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const z = getZReportToday();
    const snapshot = buildDailyReportSnapshot(app.edgeDb, {
      locationName: state?.locationName ?? "Pizza Guys",
      closureDate: todayKey(),
      printedBy: "Anteprima",
      zNumber: z?.zNumber,
    });
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .send(formatDailyReportHtml(snapshot));
  });

  app.post("/api/closure/complete", async (req, reply) => {
    const parsed = closureCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const z = getZReportToday();
    if (!z) {
      return reply.status(400).send({ error: "Chiusura Z non emessa" });
    }

    const pre = await app.inject({ method: "GET", url: "/api/closure/pre-check" });
    const check = JSON.parse(pre.body) as { canClose: boolean; blockers: string[] };
    if (!check.canClose) {
      return reply.status(400).send({ error: "Pre-check fallito", blockers: check.blockers });
    }

    const theoretical = getDayTheoretical(app.edgeDb);
    const cashDiscrepancy =
      Math.round((parsed.data.cashDeclared - theoretical.cash) * 100) / 100;
    const posDiscrepancy =
      Math.round((parsed.data.posDeclared - theoretical.pos) * 100) / 100;

    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const closureDate = todayKey();
    const record: DailyClosureRecord = {
      id: randomUUID(),
      closureDate,
      zNumber: z.zNumber,
      theoretical,
      declared: { cash: parsed.data.cashDeclared, pos: parsed.data.posDeclared },
      discrepancy: {
        cash: cashDiscrepancy,
        pos: posDiscrepancy,
        total: Math.round((cashDiscrepancy + posDiscrepancy) * 100) / 100,
      },
      operatorName: parsed.data.operatorName,
      createdAt: new Date().toISOString(),
    };

    const dailyReport = await writeDailyReportFiles(app, {
      printedBy: parsed.data.operatorName,
      zNumber: z.zNumber,
      closureDate,
    });

    const dbTables = app.edgeDb.select().from(tables).all();
    for (const table of dbTables) {
      clearTableOrders(table.id);
      setTableFree(table.id);
      broadcastTableStatus(table.id, "FREE");
    }

    const openShifts = app.edgeDb
      .select()
      .from(staffShifts)
      .where(isNull(staffShifts.endedAt))
      .all();
    const now = new Date().toISOString();
    for (const shift of openShifts) {
      app.edgeDb.update(staffShifts).set({ endedAt: now }).where(eq(staffShifts.id, shift.id)).run();
      clearShiftLedger(shift.id);
    }

    clearDayLedger(closureDate);
    clearDayReportLedger(app.edgeDb, closureDate);
    saveClosure(record);
    persistClosureArchive(app.edgeDb, record, parsed.data.operatorId);

    await mkdir(PRINT_DIR, { recursive: true });
    const reportPath = join(PRINT_DIR, `${Date.now()}-daily-closure-${record.id}.json`);
    await writeFile(
      reportPath,
      JSON.stringify({ ...record, dailyReport: dailyReport.snapshot }, null, 2),
    );

    const syncJob = {
      closureId: record.id,
      locationId: state?.locationId ?? "",
      closureDate,
      fiscalZNumber: z.zNumber,
      totals: {
        gross: dailyReport.snapshot.totals.dailyTotal,
        byChannel: buildByChannelFromSnapshot(dailyReport.snapshot),
        byPaymentMethod: theoretical.byPaymentMethod,
      },
      reconciliation: {
        cashDeclared: parsed.data.cashDeclared,
        posDeclared: parsed.data.posDeclared,
        discrepancy: record.discrepancy.total,
      },
      receipts: [
        {
          type: "daily_report",
          snapshot: dailyReport.snapshot,
          paths: {
            txt: dailyReport.txtPath,
            html: dailyReport.htmlPath,
            json: dailyReport.jsonPath,
          },
        },
      ] as unknown[],
    };

    let syncError: string | undefined;
    let syncQueued = false;
    if (state?.apiToken && state.locationId) {
      try {
        const { closureId: _id, ...cloudPayload } = syncJob;
        const syncResult = await cloudDailyClosure(state.apiToken, cloudPayload);
        record.syncedAt = syncResult.receivedAt;
        updateClosureSyncedAt(app.edgeDb, record.id, syncResult.receivedAt);
        writeEdgeAudit(app.edgeDb, {
          staffId: parsed.data.operatorId,
          operation: "DAILY_CLOSURE_SYNC_OK",
          severity: record.discrepancy.total !== 0 ? "WARNING" : "INFO",
          nextState: { closureId: record.id, closureDate, syncedAt: syncResult.receivedAt },
        });
      } catch (err) {
        syncError = err instanceof Error ? err.message : "Sync fallita";
        enqueueDailyClosureSync(app.edgeDb, syncJob);
        syncQueued = true;
        writeEdgeAudit(app.edgeDb, {
          staffId: parsed.data.operatorId,
          operation: "DAILY_CLOSURE_SYNC_QUEUED",
          severity: "WARNING",
          nextState: { closureId: record.id, closureDate, error: syncError },
        });
      }
    }

    writeEdgeAudit(app.edgeDb, {
      staffId: parsed.data.operatorId,
      operation: "DAILY_CLOSURE_COMPLETE",
      severity: record.discrepancy.total !== 0 ? "WARNING" : "INFO",
      nextState: {
        closureId: record.id,
        closureDate,
        zNumber: z.zNumber,
        operatorName: parsed.data.operatorName,
        discrepancy: record.discrepancy,
        tablesReset: dbTables.length,
        syncQueued,
      },
    });

    resetClosureSession();

    return {
      ok: true,
      closure: record,
      reportPath,
      dailyReportPath: dailyReport.txtPath,
      dailyReportHtml: dailyReport.htmlPath,
      syncError,
      syncQueued,
      tablesReset: dbTables.length,
    };
  });
}
