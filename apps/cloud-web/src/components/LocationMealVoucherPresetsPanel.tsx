"use client";

import { Button } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  btnSize,
  formRowEndClass,
  inputClass,
  inputCompactClass,
  listRowClass,
} from "@/lib/cloud-admin-ui";

interface MealVoucherPreset {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
  isActive: boolean;
}

export function LocationMealVoucherPresetsPanel({
  locationId,
  embedded = false,
}: {
  locationId: string;
  embedded?: boolean;
}) {
  const [presets, setPresets] = useState<MealVoucherPreset[]>([]);
  const [form, setForm] = useState({ label: "", amount: "8" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: "", amount: "8" });
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

  const startEdit = (preset: MealVoucherPreset) => {
    setEditingId(preset.id);
    setEditForm({
      label: preset.label,
      amount: String(Number(preset.amount)),
    });
    setMessage("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ label: "", amount: "8" });
  };

  const saveEdit = async (preset: MealVoucherPreset) => {
    const amount = Number.parseFloat(editForm.amount.replace(",", "."));
    if (!editForm.label.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Etichetta e importo obbligatori");
      return;
    }
    await api(`/api/v2/locations/${locationId}/meal-voucher-presets/${preset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ label: editForm.label.trim(), amount }),
    });
    cancelEdit();
    await load();
    setMessage("Preset aggiornato — sync verso edge al prossimo heartbeat");
  };

  const toggleActive = async (preset: MealVoucherPreset) => {
    await api(`/api/v2/locations/${locationId}/meal-voucher-presets/${preset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !preset.isActive }),
    });
    await load();
  };

  const remove = async (preset: MealVoucherPreset) => {
    if (!confirm(`Eliminare il buono pasto "${preset.label}"?`)) return;
    await api(`/api/v2/locations/${locationId}/meal-voucher-presets/${preset.id}`, {
      method: "DELETE",
    });
    if (editingId === preset.id) cancelEdit();
    await load();
    setMessage("Preset eliminato");
  };

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 rounded-lg border border-[hsl(var(--pg-border))] p-4"}>
      {!embedded && (
        <>
          <h3 className="font-semibold">Buoni pasto — importi rapidi</h3>
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
            Visibili in cassa quando si paga con buoni pasto.
          </p>
        </>
      )}
      {embedded && (
        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
          Visibili in cassa quando si paga con buoni pasto.
        </p>
      )}
      {message && <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{message}</p>}
      <form className={formRowEndClass} onSubmit={(e) => void create(e)}>
        <label className="text-sm">
          Etichetta
          <input
            className={`mt-1 block ${inputClass}`}
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Es. Ticket € 8"
          />
        </label>
        <label className="text-sm">
          Importo €
          <input
            className={`mt-1 block w-24 ${inputClass}`}
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </label>
        <Button type="submit" size={btnSize.inline}>
          Aggiungi
        </Button>
      </form>
      <ul className="space-y-2 text-sm">
        {presets.map((p) => (
          <li
            key={p.id}
            className={`${listRowClass(editingId === p.id)} rounded-md bg-[hsl(var(--pg-muted))]/40 px-3 py-2`}
          >
            {editingId === p.id ? (
              <>
                <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input
                    className={`min-w-[120px] flex-1 ${inputCompactClass}`}
                    value={editForm.label}
                    onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                  />
                  <input
                    className={`w-24 ${inputCompactClass}`}
                    value={editForm.amount}
                    onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button type="button" size={btnSize.list} variant="outline" onClick={() => void saveEdit(p)}>
                    Salva
                  </Button>
                  <Button type="button" size={btnSize.list} variant="outline" onClick={cancelEdit}>
                    Annulla
                  </Button>
                </span>
              </>
            ) : (
              <>
                <span className={p.isActive ? "" : "opacity-50 line-through"}>
                  {p.label} — € {Number(p.amount).toFixed(2)}
                </span>
                <span className="flex shrink-0 flex-wrap gap-1">
                  <Button type="button" size={btnSize.list} variant="outline" onClick={() => startEdit(p)}>
                    Modifica
                  </Button>
                  <Button
                    type="button"
                    size={btnSize.list}
                    variant="outline"
                    onClick={() => void toggleActive(p)}
                  >
                    {p.isActive ? "Disattiva" : "Attiva"}
                  </Button>
                  <Button type="button" size={btnSize.list} variant="outline" onClick={() => void remove(p)}>
                    Elimina
                  </Button>
                </span>
              </>
            )}
          </li>
        ))}
        {presets.length === 0 && (
          <li className="text-xs text-[hsl(var(--pg-muted-foreground))]">Nessun preset configurato</li>
        )}
      </ul>
    </div>
  );
}
