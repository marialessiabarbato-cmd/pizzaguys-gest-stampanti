import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MockElectronicInvoice } from "./mock-invoice.js";

function euro(value: number) {
  return `EUR ${value.toFixed(2).replace(".", ",")}`;
}

export async function buildMockInvoicePdf(invoice: MockElectronicInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = 800;
  const lineHeight = 16;

  const draw = (text: string, opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> }) => {
    const size = opts?.size ?? 11;
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: opts?.bold ? bold : regular,
      color: opts?.color ?? rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  };

  draw(`FATTURA N. ${invoice.invoiceNumber}`, { bold: true, size: 18 });
  y -= 4;
  draw(
    `Data: ${new Date(invoice.issuedAt).toLocaleDateString("it-IT")}${
      invoice.locationName ? ` · ${invoice.locationName}` : ""
    }`,
  );
  if (invoice.tableLabel) draw(`Tavolo: ${invoice.tableLabel}`);
  if (invoice.receiptId) draw(`Scontrino RT collegato: ${invoice.receiptId}`);

  y -= 8;
  draw("Cliente", { bold: true, size: 13 });
  draw(invoice.customer.businessName, { bold: true });
  if (invoice.customer.vatNumber) draw(`P.IVA ${invoice.customer.vatNumber}`);
  if (invoice.customer.taxCode) draw(`Codice fiscale ${invoice.customer.taxCode}`);
  if (invoice.customer.sdiCode) draw(`Codice SDI ${invoice.customer.sdiCode}`);
  if (invoice.customer.pec) draw(`PEC ${invoice.customer.pec}`);

  y -= 8;
  draw("Dettaglio", { bold: true, size: 13 });

  const colDesc = margin;
  const colQty = 320;
  const colPrice = 380;
  const colVat = 440;
  const colTotal = 500;

  page.drawText("Descrizione", { x: colDesc, y, size: 10, font: bold });
  page.drawText("Q.ta", { x: colQty, y, size: 10, font: bold });
  page.drawText("Prezzo", { x: colPrice, y, size: 10, font: bold });
  page.drawText("IVA%", { x: colVat, y, size: 10, font: bold });
  page.drawText("Importo", { x: colTotal, y, size: 10, font: bold });
  y -= lineHeight;

  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 547, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });

  for (const line of invoice.lines) {
    const amount = Math.round(line.quantity * line.unitPrice * 100) / 100;
    page.drawText(line.name.slice(0, 42), { x: colDesc, y, size: 10, font: regular });
    page.drawText(String(line.quantity), { x: colQty, y, size: 10, font: regular });
    page.drawText(euro(line.unitPrice), { x: colPrice, y, size: 10, font: regular });
    page.drawText(String(line.vatRate), { x: colVat, y, size: 10, font: regular });
    page.drawText(euro(amount), { x: colTotal, y, size: 10, font: regular });
    y -= lineHeight;
    if (y < 120) break;
  }

  y -= 8;
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: 547, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 4;
  page.drawText("Totale documento", { x: colPrice, y, size: 12, font: bold });
  page.drawText(euro(invoice.total), { x: colTotal, y, size: 12, font: bold });

  y -= 24;
  if (invoice.fiscalNote) {
    draw(`*** ${invoice.fiscalNote} ***`, { bold: true, color: rgb(0.75, 0.45, 0.05) });
  }

  page.drawText("Documento mock — non valido ai fini fiscali (pilota Pizza Guys Gest)", {
    x: margin,
    y: 40,
    size: 9,
    font: regular,
    color: rgb(0.45, 0.45, 0.45),
  });

  return doc.save();
}
