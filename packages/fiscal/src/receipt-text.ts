import type { PaymentMethod, PaymentSplit, VatRate } from "@pizzaguys/types";
import type { MockReceipt, MockReceiptLine } from "./mock-receipt.js";
import { calculateVatAmount } from "./vat.js";

/** Diciture dei pagamenti come sul documento commerciale RT. */
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Pagamento contante",
  POS: "Pagamento elettronico",
  SATISPAY: "Pagamento elettronico",
  MEAL_VOUCHER: "Buoni pasto",
  OTHER: "Altro pagamento",
};

/** Caratteri per riga su carta 80 mm (POS Italia ST30), come LINE_WIDTH di @pizzaguys/escpos. */
export const RECEIPT_WIDTH = 48;

/** Colonne righe articolo: DESCRIZIONE | IVA | Prezzo(€). */
const VAT_WIDTH = 7;
const PRICE_WIDTH = 8;
const DESC_WIDTH = RECEIPT_WIDTH - VAT_WIDTH - PRICE_WIDTH;

/** Importo senza simbolo, come sul documento commerciale (la colonna dice "Prezzo(€)"). */
function money(amount: number): string {
  return amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Testo a sinistra e a destra sulla stessa riga; se non ci stanno, il destro va a capo. */
function row(left: string, right: string): string[] {
  if (left.length + right.length + 1 > RECEIPT_WIDTH) {
    return [left, right.padStart(RECEIPT_WIDTH)];
  }
  return [(left + right.padStart(RECEIPT_WIDTH - left.length)).trimEnd()];
}

function center(text: string): string {
  return " ".repeat(Math.max(0, Math.floor((RECEIPT_WIDTH - text.length) / 2))) + text;
}

/** Spezza il testo in righe di al massimo `width` caratteri, a parole. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      out.push(current);
      current = word;
    }
    while (current.length > width) {
      out.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) out.push(current);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Riga articolo RT: "Q x prezzo" sopra se quantità ≠ 1, poi descrizione | IVA% | importo. */
function itemLines(line: MockReceiptLine): string[] {
  const out: string[] = [];
  if (line.quantity !== 1) {
    out.push(`${line.quantity} x ${money(line.unitPrice)}`);
  }
  const desc = wrap(line.name.toLocaleUpperCase("it-IT"), DESC_WIDTH);
  const vat = `${money(line.vatRate)}%`;
  const total = money(round2(line.quantity * line.unitPrice));
  out.push((desc[0] ?? "").padEnd(DESC_WIDTH) + vat.padStart(VAT_WIDTH) + total.padStart(PRICE_WIDTH));
  out.push(...desc.slice(1));
  return out;
}

/** IVA totale calcolata per aliquota (lordo = prezzi IVA inclusa). */
function totalVat(lines: MockReceiptLine[]): number {
  const grossByRate = new Map<number, number>();
  for (const line of lines) {
    grossByRate.set(line.vatRate, (grossByRate.get(line.vatRate) ?? 0) + line.quantity * line.unitPrice);
  }
  let vat = 0;
  for (const [rate, gross] of grossByRate) {
    vat += calculateVatAmount(round2(gross), rate as VatRate);
  }
  return round2(vat);
}

export function formatMockReceiptText(
  receipt: MockReceipt,
  meta?: {
    tableLabel?: string;
    guests?: number;
    operatorName?: string;
    amountReceived?: number;
    reprint?: boolean;
    documentNumber?: number;
    serviceTypeLabel?: string;
    paymentSplits?: PaymentSplit[];
  },
): string {
  const lines: string[] = [];
  const issued = new Date(receipt.issuedAt);

  if (meta?.reprint) {
    lines.push(center("*** RISTAMPA ***"), "");
  }

  lines.push(center("DOCUMENTO COMMERCIALE"), center("di vendita o prestazione"));
  if (receipt.documentType === "TRAINING") {
    lines.push(center("*** ADDESTRAMENTO ***"));
  }
  lines.push("");

  // "Prezzo(€)" è più largo della colonna importi: "IVA" va centrato sopra la percentuale.
  lines.push(...row("DESCRIZIONE", "IVA Prezzo(€)"));
  for (const line of receipt.lines) {
    lines.push(...itemLines(line));
  }
  lines.push("");

  lines.push(...row("SUBTOTALE", money(receipt.total)));
  lines.push(...row("TOTALE COMPLESSIVO", money(receipt.total)));
  lines.push(...row("di cui IVA", money(totalVat(receipt.lines))));

  // Importi per dicitura di pagamento; il contante è quello ricevuto (il resto è sotto).
  const splits = meta?.paymentSplits ?? receipt.paymentSplits;
  const payments = new Map<string, number>();
  const addPayment = (method: PaymentMethod, amount: number) => {
    const label = PAYMENT_LABELS[method] ?? method;
    payments.set(label, round2((payments.get(label) ?? 0) + amount));
  };
  if (splits && splits.length > 0) {
    for (const split of splits) {
      const cash = split.paymentMethod === "CASH";
      addPayment(split.paymentMethod, cash ? (split.amountReceived ?? split.amount) : split.amount);
    }
  } else {
    const cashGiven = receipt.paymentMethod === "CASH" ? meta?.amountReceived : undefined;
    addPayment(receipt.paymentMethod, cashGiven ?? receipt.total);
  }
  for (const [label, amount] of payments) {
    lines.push(...row(label, money(amount)));
  }
  if (receipt.change != null && receipt.change > 0) {
    lines.push(...row("Resto", money(receipt.change)));
  }
  lines.push(...row("Importo pagato", money(receipt.total)));

  if (receipt.fiscalNote) {
    lines.push("", center(`*** ${receipt.fiscalNote} ***`));
  }
  lines.push("");

  const guests = meta?.guests != null && meta.guests > 0 ? `Ospiti: ${meta.guests}` : "";
  if (meta?.tableLabel || guests) {
    lines.push(...row(meta?.tableLabel ? `Tavolo: ${meta.tableLabel}` : "", guests));
  }
  if (meta?.serviceTypeLabel) {
    lines.push(`Servizio: ${meta.serviceTypeLabel}`);
  }
  if (meta?.operatorName) {
    lines.push(`Vi ha servito: ${meta.operatorName}`);
  }

  const date = issued
    .toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replaceAll("/", "-");
  const time = issued.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  lines.push(`${date} ${time}`);
  if (meta?.documentNumber != null) {
    lines.push(`DOCUMENTO N. ${String(meta.documentNumber).padStart(4, "0")}`);
  }

  if (meta?.reprint) {
    lines.push("", center("*** RISTAMPA ***"));
  }

  return lines.join("\n");
}
