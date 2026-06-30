import type { DailyReportSnapshot } from "@pizzaguys/types";

const WIDTH = 42;

function money(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function padLine(left: string, right: string) {
  const gap = Math.max(1, WIDTH - left.length - right.length);
  return `${left}${" ".repeat(gap)}${right}`;
}

function center(text: string) {
  const trimmed = text.slice(0, WIDTH);
  const pad = Math.max(0, Math.floor((WIDTH - trimmed.length) / 2));
  return `${" ".repeat(pad)}${trimmed}`;
}

function rule(char = "*") {
  return char.repeat(WIDTH);
}

function sectionTitle(title: string) {
  return `\n${rule()}\n${center(title)}\n${rule()}\n`;
}

function table3(
  rows: Array<{ desc: string; qty: string; total: string }>,
  headers: [string, string, string],
) {
  const lines = [
    padLine(headers[0], headers[2]),
    padLine(headers[1], ""),
    rule("-"),
  ];
  for (const row of rows) {
    lines.push(padLine(row.desc, row.total));
    if (row.qty) lines.push(padLine(`  ${row.qty}`, ""));
  }
  return lines.join("\n");
}

function formatDateIt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDailyReportText(snapshot: DailyReportSnapshot): string {
  const lines: string[] = [];
  const { header } = snapshot;

  lines.push(rule());
  lines.push(center("REPORT GIORNALIERO"));
  lines.push(rule());
  lines.push(`Negozio: ${header.locationName}`);
  lines.push("Cassa: Tutte le casse");
  lines.push(`Dalla data contabile: ${formatDateOnly(header.closureDate)}`);
  lines.push(`Alla data contabile: ${formatDateOnly(header.closureDate)}`);
  lines.push("Turno di lavoro: Tutti i turni");
  lines.push(`Stampato il: ${formatDateIt(header.printedAt)}`);
  lines.push(`Stampato da: ${header.printedBy}`);
  if (header.zNumber != null) lines.push(`Chiusura Z: #${header.zNumber}`);

  lines.push(sectionTitle("RIEPILOGO"));
  lines.push(padLine("Totale giornaliero", money(snapshot.totals.dailyTotal)));
  lines.push(padLine("Importo riscosso", money(snapshot.totals.collected)));
  lines.push(padLine("Importo non riscosso", money(snapshot.totals.uncollected)));

  if (snapshot.coverCharge.quantity > 0) {
    lines.push(sectionTitle("COPERTI"));
    lines.push(
      table3(
        [
          {
            desc: "COPERTO",
            qty: `Quantità: ${snapshot.coverCharge.quantity}`,
            total: money(snapshot.coverCharge.total),
          },
        ],
        ["Descrizione", "Quantità", "Totale"],
      ),
    );
    lines.push(padLine("Media", money(snapshot.coverCharge.average)));
  }

  if (snapshot.serviceTypes.length > 0) {
    lines.push(sectionTitle("TIPI DI SERVIZIO"));
    lines.push(
      table3(
        snapshot.serviceTypes.map((r) => ({
          desc: r.label,
          qty: `Quantità: ${r.quantity}`,
          total: money(r.total),
        })),
        ["Descrizione", "Quantità", "Totale"],
      ),
    );
    const svcQty = snapshot.serviceTypes.reduce((s, r) => s + r.quantity, 0);
    lines.push(padLine("Totale", money(snapshot.totals.dailyTotal)));
    lines.push(padLine("", `Qty ${svcQty}`));
  }

  lines.push(sectionTitle("RETTIFICHE"));
  lines.push(padLine("Totale sconti", money(snapshot.adjustments.discounts)));
  lines.push(padLine("Promozioni", money(snapshot.adjustments.promotions)));
  lines.push(padLine("Supplementi", money(snapshot.adjustments.supplements)));
  lines.push(padLine("Documenti annullati", money(snapshot.adjustments.voided)));
  lines.push(padLine("Correzioni", money(snapshot.adjustments.corrections)));
  lines.push(padLine("Tavoli aperti", money(snapshot.adjustments.openTables)));

  if (snapshot.stornos.length > 0) {
    lines.push(sectionTitle("STORNI"));
    for (const s of snapshot.stornos) {
      lines.push(padLine(`${s.tableLabel} · ${s.itemName}`, money(-s.amount)));
      lines.push(padLine(`  Qty ${s.quantity} · ${s.operatorName}`, ""));
    }
    const stornoTotal = snapshot.stornos.reduce((sum, s) => sum + s.amount, 0);
    lines.push(padLine("Totale storni", money(-stornoTotal)));
  }

  lines.push(sectionTitle("CASSETTO"));
  lines.push(padLine("CONTANTI", money(snapshot.collected.cash)));
  lines.push(padLine("Totale", money(snapshot.collected.cash)));

  lines.push(sectionTitle("DOCUMENTI FISCALI"));
  const fd = snapshot.fiscalDocuments;
  lines.push(padLine("Scontrini", money(fd.receipts.total)));
  lines.push(padLine(`  Quantità: ${fd.receipts.count}`, ""));
  lines.push(padLine("  Pagato", money(fd.receipts.paid)));
  lines.push(padLine("  Non pagato", money(fd.receipts.unpaid)));
  if (fd.invoices.count > 0) {
    lines.push(padLine("Fatture", money(fd.invoices.total)));
    lines.push(padLine(`  Quantità: ${fd.invoices.count}`, ""));
    lines.push(padLine("  Pagato", money(fd.invoices.paid)));
  }
  if (fd.training.count > 0) {
    lines.push(padLine("Addestramento", money(fd.training.total)));
    lines.push(padLine(`  Quantità: ${fd.training.count}`, ""));
  }
  lines.push(padLine("Totale", money(snapshot.totals.dailyTotal)));

  if (snapshot.vat.length > 0) {
    lines.push(sectionTitle("IVA - GENERALE"));
    for (const row of snapshot.vat) {
      lines.push(padLine(`Aliquota ${row.rate}%`, ""));
      lines.push(padLine("  Netto", money(row.net)));
      lines.push(padLine("  Imposta", money(row.tax)));
      lines.push(padLine("  Lordo", money(row.gross)));
    }
  }

  if (snapshot.vatReceipts.length > 0) {
    lines.push(sectionTitle("IVA - SCONTRINI"));
    for (const row of snapshot.vatReceipts) {
      lines.push(padLine(`Aliquota ${row.rate}%`, ""));
      lines.push(padLine("  Netto", money(row.net)));
      lines.push(padLine("  Imposta", money(row.tax)));
      lines.push(padLine("  Lordo", money(row.gross)));
    }
  }

  if (snapshot.vatInvoices.length > 0) {
    lines.push(sectionTitle("IVA - FATTURE"));
    for (const row of snapshot.vatInvoices) {
      lines.push(padLine(`Aliquota ${row.rate}%`, ""));
      lines.push(padLine("  Netto", money(row.net)));
      lines.push(padLine("  Imposta", money(row.tax)));
      lines.push(padLine("  Lordo", money(row.gross)));
    }
  }

  if (snapshot.payments.length > 0) {
    lines.push(sectionTitle("PAGAMENTI"));
    lines.push(
      table3(
        snapshot.payments.map((p) => ({
          desc: p.label,
          qty: `Quantità: ${p.quantity}`,
          total: money(p.total),
        })),
        ["Descrizione", "Quantità", "Totale"],
      ),
    );
    lines.push(padLine("Totale", money(snapshot.totals.dailyTotal)));
  }

  if (snapshot.operators.length > 0) {
    lines.push(sectionTitle("INCASSO OPERATORI"));
    for (const op of snapshot.operators) {
      lines.push(op.name.toUpperCase());
      lines.push(padLine("  CONTANTI", money(op.cash)));
      lines.push(padLine("  CARTE", money(op.pos + op.card)));
      lines.push(padLine("  Totale pagamenti", money(op.total)));
    }
  }

  lines.push(sectionTitle("IMPORTO RISCOSSO"));
  lines.push(padLine("Contanti", money(snapshot.collected.cash)));
  lines.push(padLine("Prepagato contanti", money(snapshot.collected.prepaidCash)));
  lines.push(padLine("CC/Bancomat", money(snapshot.collected.pos)));
  lines.push(padLine("Prepagato CC/Bancomat", money(snapshot.collected.prepaidPos)));
  lines.push(padLine("Buoni pasto", money(snapshot.collected.mealVoucher)));
  lines.push(padLine("Totale", money(snapshot.collected.total)));

  if (snapshot.salesGroups.length > 0) {
    lines.push(sectionTitle("GRUPPI DI VENDITA"));
    lines.push(
      table3(
        snapshot.salesGroups.map((g) => ({
          desc: g.name,
          qty: `Quantità: ${g.quantity}`,
          total: money(g.total),
        })),
        ["Descrizione", "Quantità", "Importo"],
      ),
    );
    lines.push(padLine("Totale", money(snapshot.totals.dailyTotal)));
  }

  if (snapshot.productionCenters.length > 0) {
    lines.push(sectionTitle("CENTRI DI PRODUZIONE"));
    lines.push(
      table3(
        snapshot.productionCenters.map((c) => ({
          desc: c.name,
          qty: `Quantità: ${c.quantity}`,
          total: money(c.total),
        })),
        ["Descrizione", "Quantità", "Totale"],
      ),
    );
  }

  if (snapshot.openTables.length > 0) {
    lines.push(sectionTitle("TAVOLI APERTI"));
    for (const t of snapshot.openTables) {
      lines.push(padLine(`${t.room} · ${t.table}`, money(t.amount)));
    }
    lines.push(padLine("Totale", money(snapshot.adjustments.openTables)));
  }

  lines.push("\n" + rule("-"));
  lines.push(center("FINE DEL REPORT"));
  lines.push(rule("-"));

  return `${lines.join("\n")}\n`;
}

export function formatDailyReportHtml(snapshot: DailyReportSnapshot): string {
  const text = formatDailyReportText(snapshot);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Report giornaliero ${snapshot.header.locationName}</title>
</head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:Consolas,'Courier New',monospace;">
  <pre style="max-width:480px;margin:0 auto;padding:16px;background:#fff;border:1px solid #ddd;font-size:12px;line-height:1.35;white-space:pre-wrap;">${escaped}</pre>
</body>
</html>`;
}
