import type { PaymentMethod, PaymentSplit } from "@pizzaguys/types";
import type { MockReceipt } from "./mock-receipt.js";
import { calculateNetAmount, calculateVatAmount } from "./vat.js";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "CONTANTI",
  POS: "POS / CARTA",
  MEAL_VOUCHER: "BUONI PASTO",
  SATISPAY: "SATISPAY",
  OTHER: "ALTRO",
};

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
    lines.push("*** RISTAMPA ***");
    lines.push("");
  }

  const docLabel =
    receipt.documentType === "INVOICE"
      ? "Fattura"
      : receipt.documentType === "TRAINING"
        ? "Addestramento"
        : "Scontrino";
  const docNum = meta?.documentNumber != null ? ` # ${meta.documentNumber}` : "";
  lines.push(`${docLabel}${docNum}`);
  if (meta?.tableLabel) {
    lines.push(`Tavolo ${meta.tableLabel}`);
  }
  if (meta?.serviceTypeLabel) {
    lines.push(`Tipo di servizio ${meta.serviceTypeLabel}`);
  }
  lines.push("");

  for (const line of receipt.lines) {
    const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    lines.push(`${line.quantity} ${line.name}`.padEnd(28) + `EUR ${lineTotal.toFixed(2)}`);
  }

  lines.push("");
  lines.push(`Totale EUR ${receipt.total.toFixed(2)}`);
  lines.push("");

  if (receipt.fiscalNote) {
    lines.push(`*** ${receipt.fiscalNote} ***`);
    lines.push("");
  }

  lines.push(PAYMENT_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod);
  const splits = meta?.paymentSplits ?? receipt.paymentSplits;
  if (splits && splits.length > 1) {
    for (const split of splits) {
      lines.push(
        `  ${PAYMENT_LABELS[split.paymentMethod] ?? split.paymentMethod}: EUR ${split.amount.toFixed(2)}`,
      );
    }
  } else if (splits?.length === 1 && splits[0]!.paymentMethod === "MEAL_VOUCHER") {
    lines.push(`Buono pasto: EUR ${splits[0]!.amount.toFixed(2)}`);
  }
  if (receipt.paymentMethod === "CASH" && meta?.amountReceived != null) {
    lines.push(`Contante dato: ${meta.amountReceived.toFixed(2)}`);
    if (receipt.change != null && receipt.change > 0) {
      lines.push(`Resto: ${receipt.change.toFixed(2)}`);
    }
  }
  lines.push("");

  const vatRate = receipt.lines[0]?.vatRate ?? 10;
  const net = calculateNetAmount(receipt.total, vatRate as 4 | 10 | 22);
  const vat = calculateVatAmount(receipt.total, vatRate as 4 | 10 | 22);
  lines.push("% Iva  Netto   Lordo   IVA");
  lines.push(
    `${vatRate.toFixed(2).padStart(5)}  ${net.toFixed(2).padStart(6)}  ${receipt.total.toFixed(2).padStart(6)}  ${vat.toFixed(2).padStart(5)}`,
  );
  lines.push("");

  lines.push(
    issued.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
      " - " +
      issued.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
  );
  if (meta?.operatorName) {
    lines.push(`Op: ${meta.operatorName}`);
    lines.push(`Vi ha servito: ${meta.operatorName}`);
  }
  if (meta?.tableLabel) {
    lines.push(`Tavolo: ${meta.tableLabel}`);
  }
  if (meta?.guests != null && meta.guests > 0) {
    lines.push(`Ospiti: ${meta.guests}`);
  }
  lines.push(`Scontrino mock: ${receipt.id}`);
  if (meta?.reprint) {
    lines.push("");
    lines.push("*** RISTAMPA ***");
  }

  return lines.join("\n");
}
