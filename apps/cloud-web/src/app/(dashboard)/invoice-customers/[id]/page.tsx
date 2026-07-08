"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { backLinkClass, inlineLinkClass } from "@/lib/cloud-admin-ui";

interface CustomerDetail {
  id: string;
  brandId: string;
  businessName: string;
  address: string | null;
  postalCode: string | null;
  province: string | null;
  city: string | null;
  country: string;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-[hsl(var(--pg-muted-foreground))]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

export default function InvoiceCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    setError("");
    api<CustomerDetail>(`/api/v2/invoice-customers/${customerId}`)
      .then(setCustomer)
      .catch((err) => {
        setCustomer(null);
        setError(err instanceof Error ? err.message : "Errore caricamento");
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Link
          href="/invoice-customers"
          className={inlineLinkClass}
        >
          ← Torna ai clienti fiscali
        </Link>
        <p className="text-sm text-red-500">{error || "Cliente non trovato"}</p>
      </div>
    );
  }

  const fullAddress = [
    customer.address,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
    customer.province ? `(${customer.province})` : null,
    customer.country !== "IT" ? customer.country : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/invoice-customers"
            className={backLinkClass}
          >
            ← Torna ai clienti fiscali
          </Link>
          <h1 className="text-2xl font-bold">{customer.businessName}</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Profilo azienda per fatturazione elettronica
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs ${
              customer.isActive
                ? "bg-green-500/15 text-green-400"
                : "bg-[hsl(var(--pg-muted))] text-[hsl(var(--pg-muted-foreground))]"
            }`}
          >
            {customer.isActive ? "Attivo" : "Disattivato"}
          </span>
        </div>
        <Button variant="outline" asChild>
          <Link href="/invoice-customers">Elenco clienti</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dati anagrafici</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Ragione sociale" value={customer.businessName} />
              <Field label="Nazione" value={customer.country} />
              <Field label="Indirizzo" value={customer.address} />
              <Field label="CAP" value={customer.postalCode} />
              <Field label="Città" value={customer.city} />
              <Field label="Provincia" value={customer.province} />
            </dl>
            {fullAddress && (
              <p className="mt-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
                Indirizzo completo: {fullAddress}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dati fiscali</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Partita IVA" value={customer.vatNumber} />
              <Field label="Codice fiscale" value={customer.taxCode} />
              <Field label="Codice SDI" value={customer.sdiCode} />
              <Field label="PEC" value={customer.pec} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contatti</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefono" value={customer.phone} />
              <Field label="Email" value={customer.email} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="ID profilo" value={customer.id} />
              <Field label="Brand ID" value={customer.brandId} />
              <Field
                label="Creato il"
                value={new Date(customer.createdAt).toLocaleString("it-IT")}
              />
              <Field
                label="Aggiornato il"
                value={new Date(customer.updatedAt).toLocaleString("it-IT")}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
