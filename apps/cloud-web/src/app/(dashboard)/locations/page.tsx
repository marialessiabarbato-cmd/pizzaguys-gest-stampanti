"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Location {
  id: string;
  name: string;
  address: string;
  vatNumber: string;
  managerEmail: string;
  healthStatus: string;
  schemaVersion: number;
  lastHeartbeatAt: string | null;
  hasToken: boolean;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    vatNumber: "",
    managerEmail: "",
  });

  const load = () => api<Location[]>("/api/v2/locations").then(setLocations);

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api<{ apiToken: string }>("/api/v2/locations", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setTokenReveal(res.apiToken);
    setForm({ name: "", address: "", vatNumber: "", managerEmail: "" });
    void load();
  };

  const regenerateToken = async (id: string) => {
    if (!confirm("Rigenerare il token? Il vecchio token smetterà di funzionare.")) return;
    const res = await api<{ apiToken: string }>(`/api/v2/locations/${id}/regenerate-token`, {
      method: "POST",
    });
    setTokenReveal(res.apiToken);
    void load();
  };

  const revokeToken = async (id: string) => {
    if (!confirm("Revocare il token? L'edge perderà la connessione al cloud.")) return;
    await api(`/api/v2/locations/${id}/token`, { method: "DELETE" });
    void load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sedi</h1>

      {tokenReveal && (
        <Card className="border-[hsl(var(--pg-warning))]">
          <CardContent className="pt-6">
            <p className="mb-2 font-medium text-[hsl(var(--pg-warning))]">
              Token API — copialo ora, non verrà più mostrato:
            </p>
            <code className="block break-all rounded bg-[hsl(var(--pg-muted))] p-3 text-sm">
              {tokenReveal}
            </code>
            <Button className="mt-3" variant="outline" onClick={() => setTokenReveal(null)}>
              Ho salvato il token
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nuova sede</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            {(["name", "address", "vatNumber", "managerEmail"] as const).map((field) => (
              <input
                key={field}
                className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
                placeholder={field === "vatNumber" ? "Partita IVA (11 cifre)" : field === "name" ? "Nome sede" : field === "address" ? "Indirizzo" : "Email manager"}
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                required
              />
            ))}
            <Button type="submit" className="md:col-span-2">
              Crea sede
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
              <div>
                <p className="font-semibold">{loc.name}</p>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{loc.address}</p>
                <p className="text-xs">P.IVA {loc.vatNumber} · {loc.managerEmail}</p>
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Schema v{loc.schemaVersion} · Token: {loc.hasToken ? "attivo" : "revocato"}
                  {loc.lastHeartbeatAt && ` · Ultimo heartbeat: ${new Date(loc.lastHeartbeatAt).toLocaleString("it-IT")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase">{loc.healthStatus}</span>
                <Button variant="outline" onClick={() => regenerateToken(loc.id)}>
                  Rigenera token
                </Button>
                {loc.hasToken && (
                  <Button variant="ghost" onClick={() => revokeToken(loc.id)}>
                    Revoca
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
