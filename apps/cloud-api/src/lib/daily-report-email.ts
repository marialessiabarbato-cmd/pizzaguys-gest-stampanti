import type { DailyReportSnapshot } from "@pizzaguys/types";

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowTable(
  title: string,
  rows: Array<{ label: string; qty?: number; total: number }>,
) {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) => `<tr>
  <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:13px;">${escapeHtml(r.label)}</td>
  <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;">${r.qty ?? "—"}</td>
  <td style="padding:6px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">${euro(r.total)}</td>
</tr>`,
    )
    .join("\n");

  return `<h3 style="margin:20px 0 8px;font-size:15px;color:#111827;">${escapeHtml(title)}</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <thead>
    <tr style="background:#f9fafb;">
      <th style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:left;">Descrizione</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:center;">Qty</th>
      <th style="padding:6px 8px;border:1px solid #e5e7eb;font-size:12px;text-align:right;">Totale</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
}

export function buildLocationReportDetailHtml(snapshot: DailyReportSnapshot): string {
  const { header, totals, fiscalDocuments, adjustments } = snapshot;

  return `<div style="margin-top:24px;padding-top:16px;border-top:2px solid #e5e7eb;">
  <h2 style="margin:0 0 4px;font-size:17px;color:#b91c1c;">${escapeHtml(header.locationName)}</h2>
  <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
    Chiusura ${header.closureDate}${header.zNumber != null ? ` · Z #${header.zNumber}` : ""}
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;">Totale giornaliero</td>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${euro(totals.dailyTotal)}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;">Riscosso</td>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">${euro(totals.collected)}</td>
    </tr>
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;">Scostamento cassa</td>
      <td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;">${euro(adjustments.corrections)}</td>
    </tr>
  </table>
  ${rowTable("Tipi di servizio", snapshot.serviceTypes.map((s) => ({ label: s.label, qty: s.quantity, total: s.total })))}
  ${rowTable("Pagamenti", snapshot.payments.map((p) => ({ label: p.label, qty: p.quantity, total: p.total })))}
  ${rowTable("Gruppi di vendita", snapshot.salesGroups.map((g) => ({ label: g.name, qty: g.quantity, total: g.total })))}
  ${rowTable(
    "Dettaglio sconti",
    (snapshot.discountDetails ?? []).map((d) => ({
      label: d.label,
      qty: d.quantity,
      total: d.total,
    })),
  )}
  ${rowTable("Centri di produzione", snapshot.productionCenters.map((c) => ({ label: c.name, qty: c.quantity, total: c.total })))}
  <h3 style="margin:20px 0 8px;font-size:15px;">Documenti fiscali</h3>
  <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;">
    <li>Scontrini: ${fiscalDocuments.receipts.count} · ${euro(fiscalDocuments.receipts.total)}</li>
    <li>Fatture: ${fiscalDocuments.invoices.count} · ${euro(fiscalDocuments.invoices.total)}</li>
    <li>Addestramento: ${fiscalDocuments.training.count} · ${euro(fiscalDocuments.training.total)}</li>
  </ul>
  ${
    snapshot.operators.length > 0
      ? rowTable(
          "Incasso operatori",
          snapshot.operators.map((o) => ({
            label: o.name,
            total: o.total,
          })),
        )
      : ""
  }
</div>`;
}

export function buildLocationReportSummaryText(snapshot: DailyReportSnapshot): string {
  const lines = [
    `${snapshot.header.locationName} (${snapshot.header.closureDate})`,
    `Totale: ${euro(snapshot.totals.dailyTotal)} · Riscosso: ${euro(snapshot.totals.collected)}`,
    `Scontrini: ${snapshot.fiscalDocuments.receipts.count} · Fatture: ${snapshot.fiscalDocuments.invoices.count}`,
  ];
  if (snapshot.salesGroups.length > 0) {
    const top = snapshot.salesGroups.slice(0, 3).map((g) => `${g.name} ${euro(g.total)}`);
    lines.push(`Top vendite: ${top.join(", ")}`);
  }
  return lines.join("\n");
}
