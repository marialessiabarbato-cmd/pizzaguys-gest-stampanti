"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { api } from "@/lib/api";
import { formActionsClass, inputFullClass } from "@/lib/cloud-admin-ui";
import type { BrandSettings } from "@/lib/settings-types";

export default function SettingsDeliveryPage() {
  const [deliveryBrokers, setDeliveryBrokers] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<BrandSettings>("/api/v2/settings")
      .then((s) => setDeliveryBrokers((s.deliveryBrokers ?? []).join(", ")))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api<BrandSettings>("/api/v2/settings", {
      method: "PATCH",
      body: JSON.stringify({
        deliveryBrokers: deliveryBrokers
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-bold">Delivery</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Piattaforme di consegna attive per il brand.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Piattaforme</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : (
            <form onSubmit={save} className="max-w-lg space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Piattaforme delivery attive</label>
                <input
                  className={inputFullClass}
                  placeholder="Glovo, Deliveroo, Just Eat"
                  value={deliveryBrokers}
                  onChange={(e) => setDeliveryBrokers(e.target.value)}
                />
                <p className="mt-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Elenco separato da virgola, usato per etichette e report.
                </p>
              </div>
              <div className={formActionsClass}>
                <Button type="submit">Salva</Button>
                {saved && <p className="text-sm text-green-600">Impostazioni salvate.</p>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
