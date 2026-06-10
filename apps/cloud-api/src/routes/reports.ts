import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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
}
