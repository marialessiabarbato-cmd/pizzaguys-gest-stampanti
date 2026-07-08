"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { api } from "@/lib/api";
import { formActionsClass } from "@/lib/cloud-admin-ui";
import type { BrandSettings } from "@/lib/settings-types";

export default function SettingsFatturazionePage() {
  const [sdiEnabled, setSdiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<BrandSettings>("/api/v2/settings")
      .then((s) => setSdiEnabled(Boolean(s.sdiEnabled)))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api<BrandSettings>("/api/v2/settings", {
      method: "PATCH",
      body: JSON.stringify({ sdiEnabled }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-bold">Fatturazione elettronica</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Configurazione invio fatture al Sistema di Interscambio (SDI).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invio SDI</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : (
            <form onSubmit={save} className="max-w-lg space-y-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={sdiEnabled}
                  onChange={(e) => setSdiEnabled(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Invio automatico fatture allo SDI</span>
                  <span className="mt-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">
                    In fase pilota le fatture restano in archivio cloud in attesa. Attiva solo quando
                    il canale SDI è operativo.
                  </span>
                </span>
              </label>
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
