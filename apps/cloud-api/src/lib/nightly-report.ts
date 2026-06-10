import { dailyClosures, locations, users } from "@pizzaguys/db/schema";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { sendEmail } from "./email.js";

export interface NightlyReportRow {
  locationId: string;
  locationName: string;
  gross: number;
  cash: number;
  pos: number;
  zStatus: "Inviata" | "Mancante";
  missing: boolean;
  fiscalZNumber?: number;
  discrepancy: number;
}

function money(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function formatEuro(value: number): string {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export function yesterdayKey(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function buildNightlyReportRows(
  app: FastifyInstance,
  closureDate: string,
): Promise<NightlyReportRow[]> {
  const allLocations = await app.db.select().from(locations).orderBy(locations.name);
  const closures = await app.db
    .select()
    .from(dailyClosures)
    .where(eq(dailyClosures.closureDate, closureDate));

  const byLocation = new Map(closures.map((c) => [c.locationId, c]));

  return allLocations.map((loc) => {
    const closure = byLocation.get(loc.id);
    if (!closure) {
      return {
        locationId: loc.id,
        locationName: loc.name,
        gross: 0,
        cash: 0,
        pos: 0,
        zStatus: "Mancante" as const,
        missing: true,
        discrepancy: 0,
      };
    }

    const byMethod = closure.byPaymentMethod ?? {};
    const cash = money(byMethod.CASH ?? closure.cashDeclared);
    const pos = money(byMethod.POS ?? closure.posDeclared);

    return {
      locationId: loc.id,
      locationName: loc.name,
      gross: money(closure.gross),
      cash,
      pos,
      zStatus: closure.fiscalZNumber != null ? ("Inviata" as const) : ("Mancante" as const),
      missing: false,
      fiscalZNumber: closure.fiscalZNumber ?? undefined,
      discrepancy: money(closure.discrepancy),
    };
  });
}

export function buildNightlyReportHtml(closureDate: string, rows: NightlyReportRow[]): string {
  const totalGross = rows.reduce((sum, r) => sum + r.gross, 0);
  const missingCount = rows.filter((r) => r.missing).length;

  const tableRows = rows
    .map((row) => {
      const rowStyle = row.missing
        ? "background-color:#fee2e2;color:#991b1b;"
        : "background-color:#ffffff;color:#111827;";
      const status = row.missing
        ? `ATTENZIONE: Chiusura Fiscale non rilevata`
        : row.zStatus;

      return `<tr style="${rowStyle}">
  <td style="padding:10px 8px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;">${escapeHtml(row.locationName)}</td>
  <td style="padding:10px 8px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;text-align:right;">${formatEuro(row.gross)}</td>
  <td style="padding:10px 8px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;text-align:right;">${formatEuro(row.cash)}</td>
  <td style="padding:10px 8px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;text-align:right;">${formatEuro(row.pos)}</td>
  <td style="padding:10px 8px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:14px;">${escapeHtml(status)}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Report notturno Pizza Guys — ${closureDate}</title>
</head>
<body style="margin:0;padding:16px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:20px 16px;background-color:#b91c1c;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;line-height:1.3;">Pizza Guys — Report notturno</h1>
        <p style="margin:8px 0 0;font-size:14px;opacity:0.95;">Chiusure del ${closureDate}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px;">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">
          Riepilogo automatico delle chiusure giornaliere per tutte le sedi.
          ${missingCount > 0 ? `<strong style="color:#b91c1c;"> ${missingCount} sede/i senza chiusura fiscale.</strong>` : ""}
        </p>
        <p style="margin:0 0 16px;font-size:14px;"><strong>Totale lordo:</strong> ${formatEuro(totalGross)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background-color:#f9fafb;">
              <th style="padding:10px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:left;">Nome Sede</th>
              <th style="padding:10px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">Fatturato Lordo</th>
              <th style="padding:10px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">Quota Contanti</th>
              <th style="padding:10px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">Quota POS/Carte</th>
              <th style="padding:10px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:left;">Status Chiusura Z</th>
            </tr>
          </thead>
          <tbody>
${tableRows}
          </tbody>
        </table>
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function getSuperAdminEmails(app: FastifyInstance): Promise<string[]> {
  const admins = await app.db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)));

  const fallback = process.env.SEED_ADMIN_EMAIL ?? "admin@pizzaguys.it";
  const emails = admins.map((a) => a.email);
  return emails.length > 0 ? emails : [fallback];
}

export async function sendNightlyReport(
  app: FastifyInstance,
  closureDate?: string,
): Promise<{ closureDate: string; recipients: string[]; path?: string; rowCount: number }> {
  const date = closureDate ?? yesterdayKey();
  const rows = await buildNightlyReportRows(app, date);
  const html = buildNightlyReportHtml(date, rows);
  const recipients = await getSuperAdminEmails(app);
  const subject = `Pizza Guys — Report notturno ${date}`;

  let lastPath: string | undefined;
  for (const to of recipients) {
    const result = await sendEmail({ to, subject, html });
    lastPath = result.path;
  }

  return { closureDate: date, recipients, path: lastPath, rowCount: rows.length };
}
