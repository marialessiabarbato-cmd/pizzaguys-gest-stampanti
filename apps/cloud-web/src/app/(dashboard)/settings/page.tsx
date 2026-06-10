"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Settings {
  maxDiscountPercent: number;
  tableLockTimeoutMinutes: number;
  sdiEnabled: number;
  deliveryBrokers: string[];
  schemaVersion: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({
    maxDiscountPercent: 20,
    tableLockTimeoutMinutes: 15,
    sdiEnabled: false,
    deliveryBrokers: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Settings>("/api/v2/settings").then((s) => {
      setSettings(s);
      setForm({
        maxDiscountPercent: s.maxDiscountPercent,
        tableLockTimeoutMinutes: s.tableLockTimeoutMinutes,
        sdiEnabled: Boolean(s.sdiEnabled),
        deliveryBrokers: (s.deliveryBrokers ?? []).join(", "),
      });
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await api<Settings>("/api/v2/settings", {
      method: "PATCH",
      body: JSON.stringify({
        maxDiscountPercent: form.maxDiscountPercent,
        tableLockTimeoutMinutes: form.tableLockTimeoutMinutes,
        sdiEnabled: form.sdiEnabled,
        deliveryBrokers: form.deliveryBrokers
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean),
      }),
    });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!settings) return <p>Caricamento...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Parametri globali</h1>

      <Card>
        <CardHeader>
          <CardTitle>Brand Pizza Guys</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="max-w-md space-y-4">
            <div>
              <label className="mb-1 block text-sm">Sconto massimo (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
                value={form.maxDiscountPercent}
                onChange={(e) => setForm({ ...form, maxDiscountPercent: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Timeout lock tavolo (minuti)</label>
              <input
                type="number"
                min={1}
                max={120}
                className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
                value={form.tableLockTimeoutMinutes}
                onChange={(e) => setForm({ ...form, tableLockTimeoutMinutes: Number(e.target.value) })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sdiEnabled}
                onChange={(e) => setForm({ ...form, sdiEnabled: e.target.checked })}
              />
              Fatturazione elettronica SDI abilitata (post-MVP)
            </label>
            <div>
              <label className="mb-1 block text-sm">Broker delivery (separati da virgola)</label>
              <input
                className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
                placeholder="Glovo, Deliveroo, Just Eat"
                value={form.deliveryBrokers}
                onChange={(e) => setForm({ ...form, deliveryBrokers: e.target.value })}
              />
            </div>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              Schema version corrente: v{settings.schemaVersion}
            </p>
            <Button type="submit">Salva impostazioni</Button>
            {saved && <p className="text-sm text-green-600">Impostazioni salvate.</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
