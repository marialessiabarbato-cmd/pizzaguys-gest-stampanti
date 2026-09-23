import { locations } from "@pizzaguys/db/schema";
import { supportReportSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getEmailDeliveryMode, sendEmail } from "../lib/email.js";
import { hashApiToken } from "../lib/tokens.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function supportRoutes(app: FastifyInstance) {
  app.post("/api/v2/support/report", async (req, reply) => {
    const auth = req.headers.authorization;
    const apiToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!apiToken) {
      return reply.status(401).send({ error: "Token mancante" });
    }

    const parsed = supportReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const hash = hashApiToken(apiToken);
    const location = await app.db.query.locations.findFirst({
      where: eq(locations.apiTokenHash, hash),
    });
    if (!location) {
      return reply.status(401).send({ error: "Token non valido" });
    }

    const devEmail = process.env.DEV_REPORT_EMAIL;
    if (!devEmail) {
      app.log.warn("DEV_REPORT_EMAIL non configurata: segnalazione non inviata");
      return reply.status(503).send({ error: "Invio segnalazioni non configurato" });
    }

    const html = `<!DOCTYPE html>
<html lang="it">
<body style="margin:0;padding:16px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;">
    <tr><td style="padding:16px;background-color:#111827;color:#ffffff;">
      <h1 style="margin:0;font-size:18px;">Segnalazione problema — ${escapeHtml(location.name)}</h1>
    </td></tr>
    <tr><td style="padding:16px;font-size:14px;line-height:1.5;">
      <p><strong>Sede:</strong> ${escapeHtml(location.name)}</p>
      ${parsed.data.appName ? `<p><strong>App:</strong> ${escapeHtml(parsed.data.appName)}</p>` : ""}
      ${parsed.data.operatorName ? `<p><strong>Operatore:</strong> ${escapeHtml(parsed.data.operatorName)}</p>` : ""}
      <p><strong>Quando:</strong> ${new Date().toISOString()}</p>
      <p style="margin-top:16px;white-space:pre-wrap;">${escapeHtml(parsed.data.message)}</p>
    </td></tr>
  </table>
</body>
</html>`;

    const result = await sendEmail({
      to: devEmail,
      subject: `[Pizza Guys] Segnalazione — ${location.name}`,
      html,
    });

    return reply.send({ ok: true, mode: getEmailDeliveryMode(), path: result.path });
  });
}
