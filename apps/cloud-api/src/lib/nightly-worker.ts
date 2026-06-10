import type { FastifyInstance } from "fastify";
import { writeAudit } from "./audit.js";
import { sendNightlyReport, yesterdayKey } from "./nightly-report.js";

const CHECK_INTERVAL_MS = 60_000;

export function startNightlyReportWorker(app: FastifyInstance) {
  const hour = Number(process.env.NIGHTLY_REPORT_HOUR ?? 4);
  const minute = Number(process.env.NIGHTLY_REPORT_MINUTE ?? 30);
  const enabled = process.env.NIGHTLY_REPORT_ENABLED !== "false";

  if (!enabled) {
    app.log.info("Worker report notturno disabilitato (NIGHTLY_REPORT_ENABLED=false)");
    return;
  }

  let lastRunDate: string | null = null;

  const tick = async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() !== hour || now.getMinutes() !== minute || lastRunDate === today) {
      return;
    }

    lastRunDate = today;
    const closureDate = yesterdayKey(now);

    try {
      const result = await sendNightlyReport(app, closureDate);
      await writeAudit(app, {
        operation: "NIGHTLY_REPORT_SENT",
        severity: result.rowCount > 0 ? "INFO" : "WARNING",
        nextState: {
          closureDate: result.closureDate,
          recipients: result.recipients,
          path: result.path,
        },
      });
      app.log.info(
        { closureDate: result.closureDate, recipients: result.recipients },
        "Report notturno inviato",
      );
    } catch (err) {
      app.log.error({ err, closureDate }, "Report notturno fallito");
      await writeAudit(app, {
        operation: "NIGHTLY_REPORT_FAILED",
        severity: "CRITICAL",
        nextState: { closureDate, error: err instanceof Error ? err.message : "Errore" },
      });
    }
  };

  setInterval(() => void tick(), CHECK_INTERVAL_MS);
  app.log.info({ hour, minute }, "Worker report notturno avviato");
}
