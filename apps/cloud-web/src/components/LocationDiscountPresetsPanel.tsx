"use client";

import { Button } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DiscountPreset {
  id: string;
  label: string;
  percent: number;
  sortOrder: number;
  isActive: boolean;
}

export function LocationDiscountPresetsPanel({ locationId }: { locationId: string }) {
  const [presets, setPresets] = useState<DiscountPreset[]>([]);
  const [form, setForm] = useState({ label: "", percent: "10" });
  const [message, setMessage] = useState("");

  const load = () =>
    api<DiscountPreset[]>(`/api/v2/locations/${locationId}/discount-presets`).then(setPresets);

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : "Errore"));
  }, [locationId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    const percent = Number.parseInt(form.percent, 10);
    if (!form.label.trim() || percent < 1 || percent > 100) {
      setMessage("Etichetta e percentuale (1–100) obbligatorie");
      return;
    }
    await api(`/api/v2/locations/${locationId}/discount-presets`, {
      method: "POST",
      body: JSON.stringify({ label: form.label.trim(), percent }),
    });
    setForm({ label: "", percent: "10" });
    await load();
    setMessage("Sconto creato — sync verso edge al prossimo heartbeat");
  };

  const toggleActive = async (preset: DiscountPreset) => {
    await api(`/api/v2/locations/${locationId}/discount-presets/${preset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !preset.isActive }),
    });
    await load();
  };

  const remove = async (preset: DiscountPreset) => {
    if (!confirm(`Eliminare lo sconto "${preset.label}"?`)) return;
    await api(`/api/v2/locations/${locationId}/discount-presets/${preset.id}`, {
      method: "DELETE",
    });
    await load();
  };

  return (
    <div className="mt-4 rounded-lg border border-[hsl(var(--pg-border))] p-4">
      <h3 className="mb-2 text-sm font-semibold">Sconti rapidi in cassa</h3>
      <p className="mb-3 text-xs text-[hsl(var(--pg-muted-foreground))]">
        Pulsanti visibili alla Main Station dopo il sync con il cloud.
      </p>

      <form onSubmit={(e) => void create(e)} className="mb-3 flex flex-wrap gap-2">
        <input
          className="h-9 min-w-[140px] flex-1 rounded-md border border-[hsl(var(--pg-border))] px-2 text-sm"
          placeholder="Etichetta (es. Staff 10%)"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
        />
        <input
          type="number"
          min={1}
          max={100}
          className="h-9 w-20 rounded-md border border-[hsl(var(--pg-border))] px-2 text-sm"
          value={form.percent}
          onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))}
        />
        <Button type="submit" className="h-9">
          Aggiungi
        </Button>
      </form>

      {message && <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">{message}</p>}

      <ul className="space-y-2">
        {presets.map((preset) => (
          <li
            key={preset.id}
            className="flex items-center justify-between gap-2 rounded-md bg-[hsl(var(--pg-muted))]/40 px-3 py-2 text-sm"
          >
            <span className={preset.isActive ? "" : "opacity-50 line-through"}>
              {preset.label} · {preset.percent}%
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={() => void toggleActive(preset)}
              >
                {preset.isActive ? "Disattiva" : "Attiva"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={() => void remove(preset)}
              >
                Elimina
              </Button>
            </span>
          </li>
        ))}
        {presets.length === 0 && (
          <li className="text-xs text-[hsl(var(--pg-muted-foreground))]">Nessuno sconto configurato</li>
        )}
      </ul>
    </div>
  );
}
