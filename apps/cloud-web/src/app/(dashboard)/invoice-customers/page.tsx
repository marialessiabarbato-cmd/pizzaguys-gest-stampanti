"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { detailLinkClass, searchInputClass } from "@/lib/cloud-admin-ui";

interface CustomerRow {
  id: string;
  businessName: string;
  city: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  phone: string | null;
  isActive: boolean;
}

export default function InvoiceCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const rows = await api<CustomerRow[]>(`/api/v2/invoice-customers${query}`);
    setCustomers(rows);
  }, [search]);

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Errore caricamento"));
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clienti fiscali</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Rubrica anagrafica per fatturazione elettronica — sincronizzata con la cassa.
        </p>
      </div>

      <div className="flex max-w-md gap-2">
        <input
          className={searchInputClass}
          placeholder="Cerca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button onClick={() => void load()}>Cerca</Button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Elenco ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--pg-border))]">
                <th className="py-2 pr-4">Ragione sociale</th>
                <th className="py-2 pr-4">Città</th>
                <th className="py-2 pr-4">P.IVA</th>
                <th className="py-2 pr-4">SDI / PEC</th>
                <th className="py-2 pr-4">Tel.</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-[hsl(var(--pg-border))]/50">
                  <td className="py-2 pr-4 font-medium">{c.businessName}</td>
                  <td className="py-2 pr-4">{c.city ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">{c.vatNumber ?? c.taxCode ?? "—"}</td>
                  <td className="py-2 pr-4">{c.sdiCode ?? c.pec ?? "—"}</td>
                  <td className="py-2 pr-4">{c.phone ?? "—"}</td>
                  <td className="py-2 text-right">
                    <Link
                      href={`/invoice-customers/${c.id}`}
                      className={detailLinkClass}
                    >
                      Dettaglio
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && (
            <p className="py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
              Nessun cliente. Creane dalla cassa o esegui il seed menu.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
