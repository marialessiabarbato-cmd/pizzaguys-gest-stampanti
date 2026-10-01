import type { DailyReportSnapshot } from "@pizzaguys/types";
import { buildLocationReportDetailHtml } from "./daily-report-email.js";
import { getEmailDeliveryMode, sendEmail } from "./email.js";

export function parseEmailList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export function closureEmailRecipients(location: {
  managerEmail: string;
  partnerEmails: string | null;
}): string[] {
  return [...new Set([location.managerEmail, ...parseEmailList(location.partnerEmails)])];
}

export function buildClosureEmailHtml(dailyReport: DailyReportSnapshot): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chiusura giornata — ${dailyReport.header.locationName}</title>
</head>
<body style="margin:0;padding:16px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:20px 16px;background-color:#b91c1c;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;">Pizza Guys — Chiusura giornata</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:16px;">
        ${buildLocationReportDetailHtml(dailyReport)}
      </td>
    </tr>
    <tr>
      <td style="padding:12px 16px;background-color:#f9fafb;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
        Generato automaticamente da Pizza Guys Cloud · ${new Date().toISOString()}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendClosureEmailIfEnabled(params: {
  location: { name: string; managerEmail: string; partnerEmails: string | null; sendClosureEmail: boolean };
  closureDate: string;
  dailyReport: DailyReportSnapshot | null;
}): Promise<{ recipients: string[]; mode: ReturnType<typeof getEmailDeliveryMode> } | null> {
  if (!params.location.sendClosureEmail || !params.dailyReport) return null;

  const recipients = closureEmailRecipients(params.location);
  if (recipients.length === 0) return null;

  const html = buildClosureEmailHtml(params.dailyReport);
  const subject = `Pizza Guys — Chiusura ${params.location.name} · ${params.closureDate}`;

  for (const to of recipients) {
    await sendEmail({ to, subject, html });
  }

  return { recipients, mode: getEmailDeliveryMode() };
}
