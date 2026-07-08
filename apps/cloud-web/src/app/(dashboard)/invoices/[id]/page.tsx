"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { InvoicePdfModal } from "@/components/InvoicePdfModal";
import { api } from "@/lib/api";
import { backLinkClass, inlineLinkClass } from "@/lib/cloud-admin-ui";

interface InvoiceLine {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

interface InvoicePayload {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  receiptId: string;
  tableLabel?: string;
  customer: {
    businessName: string;
    vatNumber?: string;
    taxCode?: string;
    sdiCode?: string;
    pec?: string;
  };
  lines: InvoiceLine[];
  total: number;
  paymentMethod: string;
  fiscalNote?: string;
  mock?: boolean;
}

interface InvoiceDetail {
  id: string;
  locationId: string;
  locationName: string;
  edgeInvoiceId: string;
  receiptId: string;
  invoiceNumber: string;
  businessName: string;
  customerVatNumber: string | null;
  customerTaxCode: string | null;
  customerSdiCode: string | null;
  customerPec: string | null;
  total: number;
  paymentMethod: string;
  tableLabel: string | null;
  status: "PENDING_SEND" | "SENT_TO_SDI" | "REJECTED";
  issuedAt: string;
  receivedAt: string;
  sdiSentAt: string | null;
  payload: InvoicePayload | null;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function statusLabel(status: InvoiceDetail["status"]) {
  switch (status) {
    case "PENDING_SEND":
      return "In attesa invio SDI";
    case "SENT_TO_SDI":
      return "Inviata a SDI";
    case "REJECTED":
      return "Rifiutata";
    default:
      return status;
  }
}

function paymentLabel(method: string) {
  switch (method) {
    case "CASH":
      return "Contanti";
    case "POS":
      return "POS";
    case "MEAL_VOUCHER":
      return "Buono pasto";
    default:
      return method;
  }
}

function lineTotal(line: InvoiceLine) {
  return Math.round(line.quantity * line.unitPrice * 100) / 100;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPdf, setShowPdf] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    setError("");
    api<InvoiceDetail>(`/api/v2/invoices/${invoiceId}`)
      .then(setInvoice)
      .catch((err) => {
        setInvoice(null);
        setError(err instanceof Error ? err.message : "Errore caricamento");
      })
      .finally(() => setLoading(false));
  }, [invoiceId]);

  if (loading) {
    return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>;
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Link href="/invoices" className={inlineLinkClass}>
          ← Torna alle fatture
        </Link>
        <p className="text-sm text-red-500">{error || "Fattura non trovata"}</p>
      </div>
    );
  }

  const lines = invoice.payload?.lines ?? [];
  const hasAttachedNote = Boolean(invoice.payload?.fiscalNote);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/invoices" className={backLinkClass}>
            ← Torna alle fatture
          </Link>
          <h1 className="text-2xl font-bold">Fattura n. {invoice.invoiceNumber}</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {invoice.locationName} · {new Date(invoice.issuedAt).toLocaleString("it-IT")}
          </p>
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
            Sync cloud: {new Date(invoice.receivedAt).toLocaleString("it-IT")}
            {invoice.sdiSentAt
              ? ` · SDI: ${new Date(invoice.sdiSentAt).toLocaleString("it-IT")}`
              : ""}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/invoices">Elenco fatture</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Totale", euro(invoice.total)],
          ["Stato", statusLabel(invoice.status)],
          ["Pagamento", paymentLabel(invoice.paymentMethod)],
          ["Tavolo", invoice.tableLabel ?? "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{invoice.businessName}</p>
          {invoice.customerVatNumber && <p>P.IVA {invoice.customerVatNumber}</p>}
          {invoice.customerTaxCode && <p>Codice fiscale {invoice.customerTaxCode}</p>}
          {invoice.customerSdiCode && <p>Codice SDI {invoice.customerSdiCode}</p>}
          {invoice.customerPec && <p>PEC {invoice.customerPec}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documenti collegati</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-[hsl(var(--pg-muted-foreground))]">Scontrino RT:</span>{" "}
            <span className="font-mono">{invoice.receiptId}</span>
          </p>
          {hasAttachedNote ? (
            <button
              type="button"
              className="font-medium text-amber-600 hover:underline"
              onClick={() => setShowPdf(true)}
            >
              {invoice.payload!.fiscalNote}
              <span className="ml-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                · apri PDF
              </span>
            </button>
          ) : (
            <p>
              <span className="text-[hsl(var(--pg-muted-foreground))]">ID edge:</span>{" "}
              <span className="font-mono">{invoice.edgeInvoiceId}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Righe fattura</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {lines.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna riga nel payload sincronizzato.
            </p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--pg-border))] text-left text-[hsl(var(--pg-muted-foreground))]">
                  <th className="py-2 pr-3">Descrizione</th>
                  <th className="py-2 pr-3 text-right">Q.tà</th>
                  <th className="py-2 pr-3 text-right">Prezzo</th>
                  <th className="py-2 pr-3 text-right">IVA %</th>
                  <th className="py-2 text-right">Importo</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.name}-${index}`} className="border-b border-[hsl(var(--pg-border))]">
                    <td className="py-2 pr-3">{line.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{line.quantity}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{euro(line.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{line.vatRate}</td>
                    <td className="py-2 text-right tabular-nums">{euro(lineTotal(line))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="py-3 text-right font-medium">
                    Totale
                  </td>
                  <td className="py-3 text-right font-semibold tabular-nums">{euro(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {showPdf && (
        <InvoicePdfModal
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          onClose={() => setShowPdf(false)}
        />
      )}
    </div>
  );
}
