import type { InvoiceCustomer } from "@pizzaguys/types";
import type { MockReceiptLine } from "./mock-receipt.js";

export interface MockElectronicInvoice {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  locationId: string;
  locationName?: string;
  receiptId: string;
  tableId?: string;
  tableLabel?: string;
  customer: InvoiceCustomer;
  lines: MockReceiptLine[];
  total: number;
  paymentMethod: string;
  status: "PENDING_SEND";
  mock: true;
  fiscalNote: "FATTURA ALLEGATA";
}

let invoiceCounter = 1;

export function resetMockInvoiceCounter(value = 1) {
  invoiceCounter = value;
}

export function createMockElectronicInvoice(params: {
  locationId: string;
  locationName?: string;
  receiptId: string;
  tableId?: string;
  tableLabel?: string;
  customer: InvoiceCustomer;
  lines: MockReceiptLine[];
  paymentMethod: string;
}): MockElectronicInvoice {
  const total = Math.round(
    params.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100,
  ) / 100;

  const number = String(invoiceCounter++).padStart(5, "0");

  return {
    id: `INV-MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    invoiceNumber: number,
    issuedAt: new Date().toISOString(),
    locationId: params.locationId,
    locationName: params.locationName,
    receiptId: params.receiptId,
    tableId: params.tableId,
    tableLabel: params.tableLabel,
    customer: params.customer,
    lines: params.lines,
    total,
    paymentMethod: params.paymentMethod,
    status: "PENDING_SEND",
    mock: true,
    fiscalNote: "FATTURA ALLEGATA",
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildMockFatturaPaXml(invoice: MockElectronicInvoice): string {
  const customerId = invoice.customer.vatNumber ?? invoice.customer.taxCode ?? "N/D";
  const destCode = invoice.customer.sdiCode ?? "0000000";
  const linesXml = invoice.lines
    .map(
      (line, index) => `
    <DettaglioLinee>
      <NumeroLinea>${index + 1}</NumeroLinea>
      <Descrizione>${escapeXml(line.name)}</Descrizione>
      <Quantita>${line.quantity.toFixed(2)}</Quantita>
      <PrezzoUnitario>${line.unitPrice.toFixed(2)}</PrezzoUnitario>
      <PrezzoTotale>${(line.quantity * line.unitPrice).toFixed(2)}</PrezzoTotale>
      <AliquotaIVA>${line.vatRate.toFixed(2)}</AliquotaIVA>
    </DettaglioLinee>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- MOCK FatturaPA — non inviabile a SDI; solo per test pilota -->
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${escapeXml(customerId)}</IdCodice></IdTrasmittente>
      <CodiceDestinatario>${escapeXml(destCode)}</CodiceDestinatario>
      ${invoice.customer.pec ? `<PECDestinatario>${escapeXml(invoice.customer.pec)}</PECDestinatario>` : ""}
    </DatiTrasmissione>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <Anagrafica><Denominazione>${escapeXml(invoice.customer.businessName)}</Denominazione></Anagrafica>
        ${invoice.customer.vatNumber ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escapeXml(invoice.customer.vatNumber)}</IdCodice></IdFiscaleIVA>` : ""}
        ${invoice.customer.taxCode ? `<CodiceFiscale>${escapeXml(invoice.customer.taxCode)}</CodiceFiscale>` : ""}
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Numero>${escapeXml(invoice.invoiceNumber)}</Numero>
        <Data>${invoice.issuedAt.slice(0, 10)}</Data>
        <ImportoTotaleDocumento>${invoice.total.toFixed(2)}</ImportoTotaleDocumento>
        <Causale>MOCK pilota Pizza Guys Gest</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${linesXml}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}
