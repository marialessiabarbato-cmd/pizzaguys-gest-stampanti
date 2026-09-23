"use client";

import { Button, Card, CardContent } from "@pizzaguys/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { locationStatusLabel } from "@/lib/activity-labels";
import { api } from "@/lib/api";
import { detailLinkClass, inputFullClass } from "@/lib/cloud-admin-ui";

interface Location {
  id: string;
  name: string;
  address: string;
  vatNumber: string;
  managerEmail: string;
  coverChargeAmount: number;
  healthStatus: string;
  hasToken: boolean;
}

function statusColor(status: string) {
  if (status === "ONLINE") return "text-green-600";
  if (status === "DESYNC") return "text-amber-600";
  return "text-red-500";
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    vatNumber: "",
    managerEmail: "",
    sendClosureEmail: false,
    partnerEmails: "",
  });

  const load = () =>
    api<Location[]>("/api/v2/locations")
      .then(setLocations)
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api<{ location: { id: string }; apiToken: string }>("/api/v2/locations", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({
        name: "",
        address: "",
        vatNumber: "",
        managerEmail: "",
        sendClosureEmail: false,
        partnerEmails: "",
      });
      sessionStorage.setItem(`pg_location_token_${res.location.id}`, res.apiToken);
      router.push(`/locations/${res.location.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sedi</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Elenco punti vendita collegati al cloud.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Crea nuova sede</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-6 py-4 text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : locations.length === 0 ? (
            <p className="px-6 py-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna sede configurata. Clicca &quot;Crea nuova sede&quot; per iniziare.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--pg-border))] text-xs text-[hsl(var(--pg-muted-foreground))]">
                    <th className="px-6 py-3 font-medium">Nome</th>
                    <th className="px-3 py-3 font-medium">Indirizzo</th>
                    <th className="px-3 py-3 font-medium">Stato</th>
                    <th className="px-3 py-3 font-medium">Coperto</th>
                    <th className="px-3 py-3 font-medium">Collegamento</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc) => (
                    <tr key={loc.id} className="border-b border-[hsl(var(--pg-border))]/50">
                      <td className="px-6 py-3 font-medium">{loc.name}</td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-[hsl(var(--pg-muted-foreground))]">
                        {loc.address}
                      </td>
                      <td className={`px-3 py-3 ${statusColor(loc.healthStatus)}`}>
                        {locationStatusLabel(loc.healthStatus)}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{euro(loc.coverChargeAmount)}</td>
                      <td className="px-3 py-3 text-[hsl(var(--pg-muted-foreground))]">
                        {loc.hasToken ? "Attivo" : "Revocato"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/locations/${loc.id}`}
                          className={detailLinkClass}
                        >
                          Dettaglio
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Nuova sede</h2>
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Dopo la creazione riceverai il token API da configurare sulla Main Station.
                  </p>
                </div>
                <Button variant="ghost" type="button" onClick={() => setShowCreate(false)}>
                  ✕
                </Button>
              </div>
              <form onSubmit={create} className="grid gap-3">
                <input
                  className={inputFullClass}
                  placeholder="Nome sede"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
                <input
                  className={inputFullClass}
                  placeholder="Indirizzo"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
                <input
                  className={inputFullClass}
                  placeholder="Partita IVA (11 cifre)"
                  value={form.vatNumber}
                  onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                  required
                />
                <input
                  type="email"
                  className={inputFullClass}
                  placeholder="Email manager"
                  value={form.managerEmail}
                  onChange={(e) => setForm({ ...form, managerEmail: e.target.value })}
                  required
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.sendClosureEmail}
                    onChange={(e) => setForm({ ...form, sendClosureEmail: e.target.checked })}
                  />
                  Invia email di riepilogo alla chiusura giornaliera
                </label>
                {form.sendClosureEmail && (
                  <input
                    className={inputFullClass}
                    placeholder="Email soci (separate da virgola)"
                    value={form.partnerEmails}
                    onChange={(e) => setForm({ ...form, partnerEmails: e.target.value })}
                  />
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                    Annulla
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creazione..." : "Crea sede"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
