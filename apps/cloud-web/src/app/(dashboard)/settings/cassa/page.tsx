"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { api } from "@/lib/api";
import { formActionsClass, inputFullClass } from "@/lib/cloud-admin-ui";
import type { BrandSettings } from "@/lib/settings-types";

export default function SettingsCassaPage() {
  const [form, setForm] = useState({ maxDiscountPercent: 20, tableLockTimeoutMinutes: 15 });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<BrandSettings>("/api/v2/settings")
      .then((s) => {
        setForm({
          maxDiscountPercent: s.maxDiscountPercent,
          tableLockTimeoutMinutes: s.tableLockTimeoutMinutes,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api<BrandSettings>("/api/v2/settings", {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-bold">Cassa e comanda</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Limiti e tempi usati da cassa e comanda in tutte le sedi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parametri</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : (
            <form onSubmit={save} className="max-w-lg space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Sconto massimo consentito (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputFullClass}
                  value={form.maxDiscountPercent}
                  onChange={(e) =>
                    setForm({ ...form, maxDiscountPercent: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Oltre questa soglia la cassa chiederà conferma con PIN manager.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Tempo massimo blocco tavolo (minuti)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  className={inputFullClass}
                  value={form.tableLockTimeoutMinutes}
                  onChange={(e) =>
                    setForm({ ...form, tableLockTimeoutMinutes: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Dopo questo intervallo il tavolo si sblocca automaticamente se il cameriere non è
                  più attivo sulla comanda.
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
