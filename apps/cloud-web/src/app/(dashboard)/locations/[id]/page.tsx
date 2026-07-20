"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LocationDiscountPresetsPanel } from "@/components/LocationDiscountPresetsPanel";
import { LocationMealVoucherPresetsPanel } from "@/components/LocationMealVoucherPresetsPanel";
import { locationStatusLabel } from "@/lib/activity-labels";
import { api } from "@/lib/api";
import {
  backLinkClass,
  btnSize,
  formRowEndGap3Class,
  inputClass,
} from "@/lib/cloud-admin-ui";

interface LocationDetail {
  id: string;
  name: string;
  address: string;
  vatNumber: string;
  fiscalCode: string | null;
  managerEmail: string;
  coverChargeAmount: number;
  maxGuestCapacity: number;
  healthStatus: string;
  schemaVersion: number;
  lastHeartbeatAt: string | null;
  hasToken: boolean;
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

function statusColor(status: string) {
  if (status === "ONLINE") return "text-green-600";
  if (status === "DESYNC") return "text-amber-600";
  return "text-red-500";
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);
  const [coverCharge, setCoverCharge] = useState("0");
  const [maxGuestCapacity, setMaxGuestCapacity] = useState("0");

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError("");
    try {
      const row = await api<LocationDetail>(`/api/v2/locations/${locationId}`);
      setLocation(row);
      setCoverCharge(String(row.coverChargeAmount));
      setMaxGuestCapacity(String(row.maxGuestCapacity ?? 0));
    } catch (err) {
      setLocation(null);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!locationId) return;
    const stored = sessionStorage.getItem(`pg_location_token_${locationId}`);
    if (stored) {
      setTokenReveal(stored);
      sessionStorage.removeItem(`pg_location_token_${locationId}`);
    }
  }, [locationId]);

  const saveCoverCharge = async () => {
    if (!location) return;
    const amount = Number(coverCharge);
    if (!Number.isFinite(amount) || amount < 0) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ coverChargeAmount: amount }),
    });
    await load();
  };

  const saveMaxGuestCapacity = async () => {
    if (!location) return;
    const capacity = Number.parseInt(maxGuestCapacity, 10);
    if (!Number.isFinite(capacity) || capacity < 0) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ maxGuestCapacity: capacity }),
    });
    await load();
  };

  const regenerateToken = async () => {
    if (!location || !confirm("Rigenerare il token? Il vecchio token smetterà di funzionare.")) return;
    const res = await api<{ apiToken: string }>(`/api/v2/locations/${location.id}/regenerate-token`, {
      method: "POST",
    });
    setTokenReveal(res.apiToken);
    await load();
  };

  const revokeToken = async () => {
    if (!location || !confirm("Revocare il token? L'edge perderà la connessione al cloud.")) return;
    await api(`/api/v2/locations/${location.id}/token`, { method: "DELETE" });
    await load();
  };

  if (loading) {
    return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>;
  }

  if (error || !location) {
    return (
      <div className="space-y-4">
        <Link href="/locations" className={backLinkClass}>
          ← Torna alle sedi
        </Link>
        <p className="text-sm text-red-500">{error || "Sede non trovata"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/locations"
            className={backLinkClass}
          >
            ← Torna alle sedi
          </Link>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <p className={`text-sm ${statusColor(location.healthStatus)}`}>
            {locationStatusLabel(location.healthStatus)}
            {location.lastHeartbeatAt && (
              <span className="text-[hsl(var(--pg-muted-foreground))]">
                {" "}
                · Ultimo contatto {new Date(location.lastHeartbeatAt).toLocaleString("it-IT")}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/locations">Elenco sedi</Link>
        </Button>
      </div>

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
          <CardTitle>Dati sede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nome" value={location.name} />
            <Field label="Indirizzo" value={location.address} />
            <Field label="Partita IVA" value={location.vatNumber} />
            <Field label="Codice fiscale" value={location.fiscalCode} />
            <Field label="Email manager" value={location.managerEmail} />
            <Field label="Token collegamento" value={location.hasToken ? "Attivo" : "Revocato"} />
            <Field
              label="Creato il"
              value={new Date(location.createdAt).toLocaleString("it-IT")}
            />
            <Field
              label="Aggiornato il"
              value={new Date(location.updatedAt).toLocaleString("it-IT")}
            />
          </dl>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 block text-sm font-medium">Coperto (€ per persona)</label>
            <div className={formRowEndGap3Class}>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className={`w-28 ${inputClass}`}
                value={coverCharge}
                onChange={(e) => setCoverCharge(e.target.value)}
              />
              <Button type="button" size={btnSize.inline} variant="outline" onClick={() => void saveCoverCharge()}>
                Salva coperto
              </Button>
              <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Attuale: {euro(location.coverChargeAmount)}
              </span>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 block text-sm font-medium">
              Capienza massima coperti sede
            </label>
            <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
              Intero ≥ 0. Valore 0 = illimitata.
            </p>
            <div className={formRowEndGap3Class}>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                className={`w-28 ${inputClass}`}
                value={maxGuestCapacity}
                onChange={(e) => setMaxGuestCapacity(e.target.value)}
              />
              <Button
                type="button"
                size={btnSize.inline}
                variant="outline"
                onClick={() => void saveMaxGuestCapacity()}
              >
                Salva capienza
              </Button>
              <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Attuale:{" "}
                {location.maxGuestCapacity === 0
                  ? "Illimitata"
                  : `${location.maxGuestCapacity} coperti`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--pg-border))] pt-4">
            <Button type="button" size={btnSize.inline} variant="outline" onClick={() => void regenerateToken()}>
              Rigenera token
            </Button>
            {location.hasToken && (
              <Button type="button" size={btnSize.inline} variant="ghost" onClick={() => void revokeToken()}>
                Revoca token
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sconti rapidi in cassa</CardTitle>
        </CardHeader>
        <CardContent>
          <LocationDiscountPresetsPanel locationId={location.id} embedded />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buoni pasto — importi rapidi</CardTitle>
        </CardHeader>
        <CardContent>
          <LocationMealVoucherPresetsPanel locationId={location.id} embedded />
        </CardContent>
      </Card>
    </div>
  );
}
