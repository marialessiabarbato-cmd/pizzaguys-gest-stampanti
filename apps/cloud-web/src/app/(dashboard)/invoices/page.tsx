"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Location {
  id: string;
  name: string;
}

interface InvoiceRow {
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
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export default function InvoicesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const query = locationId ? `?locationId=${locationId}` : "";
      const data = await api<{ invoices: InvoiceRow[] }>(`/api/v2/invoices${query}`);
      setInvoices(data.invoices);
      if (data.invoices.length === 0) {
        setMessage("Nessuna fattura sincronizzata. Emetti un pagamento con documento Fattura dalla cassa.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void api<Location[]>("/api/v2/locations").then(setLocations).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fatture elettroniche</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Mock pilota — ricevute dal edge dopo pagamento con documento Fattura. Invio SDI reale in Fase 7.
          </p>
        </div>
        <Button onClick={() => void load()} disabled={loading}>
          Aggiorna
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtro sede</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full max-w-md rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">Tutte le sedi</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {message && <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Elenco ({invoices.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--pg-border))] text-[hsl(var(--pg-muted-foreground))]">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Sede</th>
                <th className="py-2 pr-3">N°</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Totale</th>
                <th className="py-2 pr-3">Stato</th>
                <th className="py-2">Scontrino RT</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[hsl(var(--pg-border))]">
                  <td className="py-3 pr-3">{new Date(inv.issuedAt).toLocaleString("it-IT")}</td>
                  <td className="py-3 pr-3">{inv.locationName}</td>
                  <td className="py-3 pr-3 font-mono">{inv.invoiceNumber}</td>
                  <td className="py-3 pr-3">
                    <div className="font-medium">{inv.businessName}</div>
                    <div className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {inv.customerVatNumber && <>P.IVA {inv.customerVatNumber}</>}
                      {inv.customerTaxCode && <> · CF {inv.customerTaxCode}</>}
                      {inv.customerSdiCode && <> · SDI {inv.customerSdiCode}</>}
                      {inv.customerPec && <> · PEC {inv.customerPec}</>}
                    </div>
                  </td>
                  <td className="py-3 pr-3">{euro(inv.total)}</td>
                  <td className="py-3 pr-3">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-xs">{inv.receiptId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
