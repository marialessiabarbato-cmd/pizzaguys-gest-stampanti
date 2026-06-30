import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getEmailDeliveryMode } from "../lib/email.js";
import { writeAudit } from "../lib/audit.js";
import {
  buildNightlyReportHtml,
  buildNightlyReportRows,
  sendNightlyReport,
  yesterdayKey,
} from "../lib/nightly-report.js";

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== "SUPER_ADMIN") {
    return reply.status(403).send({ error: "Solo SuperAdmin", code: "FORBIDDEN" });
  }
}

export async function reportRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate, requireSuperAdmin] };

  app.get("/api/v2/reports/email-config", guard, async () => ({
    mode: getEmailDeliveryMode(),
    mockDir: process.env.EMAIL_MOCK_DIR ?? "./tmp/emails",
    from: process.env.EMAIL_FROM ?? null,
  }));

  app.post<{ Querystring: { date?: string } }>(
    "/api/v2/reports/nightly/send",
    guard,
    async (req, reply) => {
      const closureDate = req.query.date ?? yesterdayKey();
      const result = await sendNightlyReport(app, closureDate);

      await writeAudit(app, {
        userId: req.user.sub,
        operation: "NIGHTLY_REPORT_MANUAL",
        nextState: result,
      });

      return reply.send({ ok: true, ...result });
    },
  );

  app.get<{ Querystring: { date?: string } }>(
    "/api/v2/reports/nightly/preview",
    guard,
    async (req, reply) => {
      const closureDate = req.query.date ?? yesterdayKey();
      const rows = await buildNightlyReportRows(app, closureDate);
      const html = buildNightlyReportHtml(closureDate, rows);
      return reply.header("Content-Type", "text/html; charset=utf-8").send(html);
    },
  );

  app.get<{ Querystring: { date?: string } }>(
    "/api/v2/reports/nightly/summary",
    guard,
    async (req) => {
      const closureDate = req.query.date ?? yesterdayKey();
      const rows = await buildNightlyReportRows(app, closureDate);
      const totalGross = rows.reduce((sum, r) => sum + r.gross, 0);
      const missingCount = rows.filter((r) => r.missing).length;
      return {
        closureDate,
        totalGross,
        missingCount,
        detailCount: rows.filter((r) => r.dailyReport).length,
        rows,
      };
    },
  );
}
