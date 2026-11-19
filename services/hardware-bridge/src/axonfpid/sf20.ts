import type { FiscalOrderInput } from "../types.js";

/**
 * Costruttore dei documenti SF20 per axonFPiD / Hydra II RT.
 *
 * La sintassi qui sotto è ricavata dagli esempi del Pannello del Tecnico
 * (foto del 11/11/2026) e dalla configurazione letta dall'RT di Caserta
 * (Configurazione.TXT). I punti MARCATI "DA VERIFICARE" non sono confermati
 * dal protocollo ufficiale: vanno controllati con una prova controllata
 * (locale chiuso, importo minimo, poi storno) prima dell'uso in servizio.
 */

export interface Sf20Config {
  /** Reparto RT per aliquota IVA. Default RT Caserta: 10% → 1, 22% → 2, 4% → 3. */
  repartoByVat: Record<number, number>;
  /** Riga di identificazione (es. "I/12345678/0/"). DA VERIFICARE: se vuota viene omessa. */
  identLine?: string;
  /** Lunghezza massima della descrizione di riga. DA VERIFICARE sull'RT. */
  maxDescriptionLength: number;
  /** Ultimo campo della riga di vendita: 0 = bene, 1 = servizio. DA VERIFICARE per la ristorazione. */
  serviceFlag: 0 | 1;
  /** Se true il pagamento contanti porta l'importo consegnato (l'RT calcola il resto). DA VERIFICARE. */
  cashSendsReceived: boolean;
}

export const DEFAULT_SF20_CONFIG: Sf20Config = {
  repartoByVat: { 10: 1, 22: 2, 4: 3 },
  identLine: undefined,
  maxDescriptionLength: 32,
  serviceFlag: 0,
  cashSendsReceived: false,
};

/** Numero pagamento e tipo sull'RT di Caserta (da Configurazione.TXT). */
const PAYMENTS = {
  CASH: { n: 1, type: "PC", sub: "" },
  POS: { n: 4, type: "PE", sub: "" },
  SATISPAY: { n: 4, type: "PE", sub: "" },
  MEAL_VOUCHER: { n: 3, type: "NR", sub: "TKT" },
} as const;

export class Sf20BuildError extends Error {}

const cents = (n: number): number => Math.round(n * 100);

/** Prezzo con punto decimale e due cifre. */
export function formatPrice(amount: number): string {
  return (cents(amount) / 100).toFixed(2);
}

/** Quantità con punto decimale, fino a 3 cifre, senza zeri inutili. */
export function formatQuantity(qty: number): string {
  return String(Math.round(qty * 1000) / 1000);
}

/** Descrizione sicura per l'RT: solo ASCII, niente "/" né ";", lunghezza limitata. */
export function sanitizeDescription(text: string, maxLength: number): string {
  const ascii = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f/;]/g, " ")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
  return (ascii || "ARTICOLO").slice(0, maxLength).trim();
}

/** Righe SF20 di un documento commerciale (scontrino). Una riga per comando. */
export function buildReceiptLines(
  order: FiscalOrderInput,
  config: Sf20Config = DEFAULT_SF20_CONFIG,
): string[] {
  if (order.documentType === "INVOICE") {
    throw new Sf20BuildError(
      "Fattura sull'RT non ancora abilitata: serve la conferma del comando e di come lo gestisce oggi la cassa",
    );
  }
  if (order.documentType === "TRAINING") {
    throw new Sf20BuildError("Documento di prova non supportato sull'RT reale (emetterebbe un documento fiscale)");
  }
  if (order.lines.length === 0) {
    throw new Sf20BuildError("Scontrino senza righe");
  }

  const out: string[] = [];
  if (config.identLine) out.push(config.identLine);

  let totalCents = 0;
  for (const line of order.lines) {
    const reparto = config.repartoByVat[line.vatRate];
    if (reparto === undefined) {
      throw new Sf20BuildError(`Nessun reparto RT per l'aliquota IVA ${line.vatRate}%`);
    }
    if (!(line.quantity > 0) || !(line.unitPrice > 0)) {
      throw new Sf20BuildError(`Riga non valida: ${line.name}`);
    }
    totalCents += Math.round(line.quantity * cents(line.unitPrice));
    const descr = sanitizeDescription(line.name, config.maxDescriptionLength);
    out.push(
      `3/S/${descr}//${formatQuantity(line.quantity)}/${formatPrice(line.unitPrice)}/${reparto}/${line.vatRate}///${config.serviceFlag}/`,
    );
  }

  out.push("U/");

  const splits =
    order.paymentSplits && order.paymentSplits.length > 0
      ? order.paymentSplits
      : [
          {
            paymentMethod: order.paymentMethod,
            amount: totalCents / 100,
            amountReceived: order.amountReceived,
          },
        ];

  let paidCents = 0;
  for (const split of splits) {
    const pay = (PAYMENTS as Record<string, { n: number; type: string; sub: string } | undefined>)[
      split.paymentMethod
    ];
    if (!pay) {
      throw new Sf20BuildError(`Metodo di pagamento non supportato sull'RT: ${split.paymentMethod}`);
    }
    paidCents += cents(split.amount);
    const shown =
      config.cashSendsReceived && split.paymentMethod === "CASH" && split.amountReceived != null
        ? Math.max(split.amountReceived, split.amount)
        : split.amount;
    out.push(`5/${pay.n}/${formatPrice(shown)}////${pay.type}/${pay.sub}/`);
  }

  if (paidCents !== totalCents) {
    throw new Sf20BuildError(
      `Pagamenti (${(paidCents / 100).toFixed(2)}) diversi dal totale righe (${(totalCents / 100).toFixed(2)})`,
    );
  }
  return out;
}

/** Testo del file TXT da consegnare ad axonFPiD (righe separate da CRLF). */
export function buildReceiptDocument(
  order: FiscalOrderInput,
  config: Sf20Config = DEFAULT_SF20_CONFIG,
): string {
  return buildReceiptLines(order, config).join("\r\n") + "\r\n";
}
