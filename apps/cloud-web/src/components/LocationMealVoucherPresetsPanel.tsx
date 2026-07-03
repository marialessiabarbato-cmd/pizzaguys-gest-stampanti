"use client";

import { Button } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface MealVoucherPreset {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
  isActive: boolean;
}

export function LocationMealVoucherPresetsPanel({ locationId }: { locationId: string }) {
  const [presets, setPresets] = useState<MealVoucherPreset[]>([]);
  const [form, setForm] = useState({ label: "", amount: "8" });
  const [message, setMessage] = useState("");

  const load = () =>
    api<MealVoucherPreset[]>(`/api/v2/locations/${locationId}/meal-voucher-presets`).then(setPresets);

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Errore"));
  }, [locationId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const amount = Number.parseFloat(form.amount.replace(",", "."));
    if (!form.label.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Etichetta e importo obbligatori");
      return;
    }
    await api(`/api/v2/locations/${locationId}/meal-voucher-presets`, {
      method: "POST",
      body: JSON.stringify({ label: form.label.trim(), amount }),
    });
    setForm({ label: "", amount: "8" });
    await load();
    setMessage("Preset creato — sync verso edge al prossimo heartbeat");
  };

  const toggleActive = async (preset: MealVoucherPreset) => {
    await api(`/api/v2/locations/${locationId}/meal-voucher-presets/${preset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !preset.isActive }),
    });
    await load();
  };

  return (
    <div className="space-y-3 rounded-lg border border-[hsl(var(--pg-border))] p-4">
      <h3 className="font-semibold">Buoni pasto — importi rapidi</h3>
      <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
        Visibili in cassa quando si paga con buoni pasto.
      </p>
      {message && <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{message}</p>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => void create(e)}>
        <label className="text-sm">
          Etichetta
          <input
            className="mt-1 block h-9 rounded-md border border-[hsl(var(--pg-border))] px-2"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Es. Ticket € 8"
          />
        </label>
        <label className="text-sm">
          Importo €
          <input
            className="mt-1 block h-9 w-24 rounded-md border border-[hsl(var(--pg-border))] px-2"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </label>
        <Button type="submit" className="h-9">
          Aggiungi
        </Button>
      </form>
      <ul className="space-y-1 text-sm">
        {presets.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2">
            <span className={p.isActive ? "" : "opacity-50 line-through"}>
              {p.label} — € {Number(p.amount).toFixed(2)}
            </span>
            <Button variant="outline" className="h-8 text-xs" onClick={() => void toggleActive(p)}>
              {p.isActive ? "Disattiva" : "Attiva"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
