import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import {
  buildCashSessionReportTicket,
  stripEscPos,
  type CashSessionReportRow,
} from "@pizzaguys/escpos";
import { createHardwareBridge, type PrintResult } from "@pizzaguys/hardware-bridge";
import {
  CASH_MOVEMENT_LABELS,
  CASH_SERVICE_LABELS,
  type CashMovement,
  type CashSession,
} from "@pizzaguys/types";
import { reportPrintFailures } from "./print-alerts.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

const METHOD_LABELS: Record<string, string> = {
  CASH: "Contanti",
  POS: "Carte / POS",
  MEAL_VOUCHER: "Buoni pasto",
  SATISPAY: "Satispay",
  OTHER: "Altro",
};

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : "—";
}

/** Righe del report di chiusura: incassi, cassetto, conteggio e scostamenti. */
export function buildCashSessionReportParams(session: CashSession, movements: CashMovement[]) {
  const t = session.theoretical;
  if (!t) throw new Error("Sessione non chiusa: report non disponibile");

  const sales: CashSessionReportRow[] = [{ label: `INCASSI (${t.documentCount} documenti)` }];
  for (const [method, amount] of Object.entries(t.byPaymentMethod)) {
    sales.push({ label: METHOD_LABELS[method] ?? method, amount });
  }
  sales.push({ label: "Totale incassato", amount: t.totalSales });

  const drawer: CashSessionReportRow[] = [
    { label: "CASSETTO CONTANTI" },
    { label: "Fondo iniziale", amount: t.openingFund },
    { label: "Incassi in contanti", amount: t.cashSales },
  ];
  if (t.deposits) drawer.push({ label: "Versamenti", amount: t.deposits });
  for (const m of movements.filter((x) => x.type !== "DEPOSIT")) {
    drawer.push({
      label: `${CASH_MOVEMENT_LABELS[m.type]}${m.reason ? ` - ${m.reason}` : ""}`,
      amount: -m.amount,
    });
  }
  drawer.push({ label: "Contanti attesi", amount: t.expectedCash, emphasis: true });

  const count: CashSessionReportRow[] = [
    { label: "CONTEGGIO" },
    { label: "Contanti contati", amount: session.countedCash ?? 0, emphasis: true },
    { label: "Scostamento contanti", amount: session.discrepancyCash ?? 0, emphasis: true },
    { label: "POS dichiarato (strisciata)", amount: session.posDeclared ?? 0 },
    { label: "POS teorico", amount: t.posSales },
    { label: "Scostamento POS", amount: session.discrepancyPos ?? 0 },
    { label: "Fondo lasciato in cassa", amount: session.closingFundLeft ?? 0 },
  ];

  const serviceLabel = CASH_SERVICE_LABELS[session.service].toUpperCase();
  return {
    title: `CHIUSURA CASSA ${serviceLabel}`,
    subtitle: formatDate(session.businessDate),
    sections: [sales, drawer, count],
    notes: session.notes,
    footer: [
      `Aperta: ${formatTime(session.openedAt)} - ${session.openedByName}`,
      `Chiusa: ${formatTime(session.closedAt)} - ${session.closedByName ?? "—"}`,
    ],
  };
}

/** Salva il report in tmp/prints e lo stampa sulla stampante Bar (in background per l'utente). */
export async function writeAndPrintCashSessionReport(
  db: EdgeDatabase,
  session: CashSession,
  movements: CashMovement[],
): Promise<{ reportPath: string; printResult: PrintResult | null; printMessages: string[] }> {
  const ticket = buildCashSessionReportTicket(buildCashSessionReportParams(session, movements));
  await mkdir(PRINT_DIR, { recursive: true });
  const base = `${Date.now()}-cash-session-${session.businessDate}-${session.service}`;
  const reportPath = join(PRINT_DIR, `${base}.txt`);
  // stripEscPos decodifica in latin1: € e — (CP1252 0x80/0x97) vanno ripristinati per il file.
  const text = stripEscPos(ticket).replace(/\x80/g, "€").replace(/\x97/g, "—");
  await writeFile(reportPath, text, "utf8");
  await writeFile(
    join(PRINT_DIR, `${base}.json`),
    JSON.stringify({ session, movements }, null, 2),
  );

  const all = db.select().from(printers).all();
  const printer =
    all.find((p) => p.enabled && p.workCenter === "BAR") ?? all.find((p) => p.enabled);
  let printResult: PrintResult | null = null;
  let printMessages: string[] = [];
  try {
    printResult = await hardware.printEscPos(
      printer?.id ?? "cassa",
      ticket,
      `cash-session-${session.service.toLowerCase()}`,
      printer ? { host: printer.host, port: printer.port } : undefined,
    );
    const label = `${CASH_SERVICE_LABELS[session.service]} ${formatDate(session.businessDate)}`;
    printMessages = reportPrintFailures(db, "CHIUSURA_CASSA", label, [printResult]);
  } catch (err) {
    printMessages = [err instanceof Error ? err.message : "Stampa report non riuscita"];
  }
  return { reportPath, printResult, printMessages };
}
