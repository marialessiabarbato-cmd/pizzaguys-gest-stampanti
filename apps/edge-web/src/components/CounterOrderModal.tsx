import { Button } from "@pizzaguys/ui";
import { useEffect, useMemo, useState } from "react";
import { CounterCustomerPicker } from "./CounterCustomerPicker";
import { edgeApi } from "../lib/api";
import type { CounterCustomerSelection } from "../lib/counter-customers";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export type CounterChannel = "TAKEAWAY" | "DELIVERY";

export interface CounterOrderForm {
  channel: CounterChannel;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  broker: string;
  asap: boolean;
  hour: number;
  minute: number;
}

function defaultForm(channel: CounterChannel): CounterOrderForm {
  const now = new Date();
  return {
    channel,
    customerName: "",
    phone: "",
    address: "",
    notes: "",
    broker: "",
    asap: true,
    hour: now.getHours(),
    minute: Math.ceil(now.getMinutes() / 5) * 5 % 60,
  };
}

function formatTimeLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildScheduledAt(asap: boolean, hour: number, minute: number): string | undefined {
  if (asap) return undefined;
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

export function CounterOrderModal({
  initialChannel,
  loading,
  embedded = false,
  hideChannelTabs = false,
  recentCustomers = [],
  onConfirm,
  onClose,
}: {
  initialChannel: CounterChannel;
  loading?: boolean;
  /** Se true, il form riempie il pannello laterale senza coprire la mappa */
  embedded?: boolean;
  /** Nasconde Asporto/Consegna quando il canale è già scelto dalla pagina */
  hideChannelTabs?: boolean;
  /** Clienti da ordini asporto/delivery già aperti (per selezione rapida) */
  recentCustomers?: CounterCustomerSelection[];
  onConfirm: (payload: {
    channel: CounterChannel;
    customerName?: string;
    phone?: string;
    address?: string;
    notes?: string;
    broker?: string;
    asap: boolean;
    scheduledAt?: string;
  }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CounterOrderForm>(() => defaultForm(initialChannel));
  const [brokers, setBrokers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  useEffect(() => {
    setForm(defaultForm(initialChannel));
    setShowCustomerPicker(false);
  }, [initialChannel]);

  useEffect(() => {
    void edgeApi<{ snapshot?: { settings?: { deliveryBrokers?: string[] } } }>("/api/menu").then(
      (m) => setBrokers(m.snapshot?.settings?.deliveryBrokers ?? []),
    );
  }, []);

  const timeLabel = useMemo(
    () => (form.asap ? "Il prima possibile" : formatTimeLabel(form.hour, form.minute)),
    [form.asap, form.hour, form.minute],
  );

  const orderTypeLabel = form.channel === "TAKEAWAY" ? "ASPORTO" : "CONSEGNA";

  const setField = <K extends keyof CounterOrderForm>(key: K, value: CounterOrderForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const applyCustomer = (customer: CounterCustomerSelection) => {
    setForm((prev) => ({
      ...prev,
      customerName: customer.name,
      phone: customer.phone ?? prev.phone,
      address: customer.address ?? prev.address,
    }));
    setShowCustomerPicker(false);
    setError("");
  };

  const handleConfirm = () => {
    if (form.channel === "DELIVERY" && !form.asap && !buildScheduledAt(false, form.hour, form.minute)) {
      setError("Seleziona un orario valido");
      return;
    }
    onConfirm({
      channel: form.channel,
      customerName: form.customerName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.channel === "DELIVERY" ? form.address.trim() || undefined : undefined,
      notes: form.notes.trim() || undefined,
      broker: form.channel === "DELIVERY" ? form.broker.trim() || undefined : undefined,
      asap: form.asap,
      scheduledAt: buildScheduledAt(form.asap, form.hour, form.minute),
    });
  };

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col bg-[hsl(var(--pg-background))]"
          : "fixed inset-0 z-50 flex flex-col bg-[hsl(var(--pg-background))]"
      }
    >
      {!hideChannelTabs && (
      <div className="grid shrink-0 grid-cols-2 border-b border-[hsl(var(--pg-border))]">
        {(
          [
            ["TAKEAWAY", "Asporto"],
            ["DELIVERY", "Consegna"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`min-h-[48px] px-3 py-2 text-sm font-semibold transition ${
              form.channel === id
                ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                : "bg-[hsl(var(--pg-muted))]/40 text-[hsl(var(--pg-muted-foreground))]"
            }`}
            onClick={() => setField("channel", id)}
          >
            {label}
          </button>
        ))}
      </div>
      )}

      <div
        className={`grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 ${
          embedded ? "grid-cols-2" : "grid-cols-1 lg:grid-cols-2"
        }`}
      >
        <section className="space-y-3">
          <Button
            type="button"
            className={`w-full ${embedded ? "h-10 text-sm" : "h-12 text-base"}`}
            variant={form.asap ? "default" : "outline"}
            onClick={() => setField("asap", true)}
          >
            Il prima possibile
          </Button>

          <div>
            <p className="mb-2 text-sm font-semibold">Ora</p>
            <div className={`grid gap-1.5 ${embedded ? "grid-cols-6" : "grid-cols-6 sm:grid-cols-8"}`}>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`rounded-lg text-sm font-medium ${
                    embedded ? "min-h-[36px]" : "min-h-[44px]"
                  } ${
                    !form.asap && form.hour === h
                      ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                      : "bg-[hsl(var(--pg-muted))]"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, asap: false, hour: h }))}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Minuti</p>
            <div className={`grid gap-1.5 ${embedded ? "grid-cols-4" : "grid-cols-6"}`}>
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`rounded-lg text-sm font-medium ${
                    embedded ? "min-h-[36px]" : "min-h-[44px]"
                  } ${
                    !form.asap && form.minute === m
                      ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                      : "bg-[hsl(var(--pg-muted))]"
                  }`}
                  onClick={() => setForm((prev) => ({ ...prev, asap: false, minute: m }))}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium">Cliente</label>
              <Button
                type="button"
                variant={showCustomerPicker ? "default" : "outline"}
                className="h-8 px-3 text-xs"
                onClick={() => setShowCustomerPicker((open) => !open)}
              >
                {showCustomerPicker ? "Chiudi rubrica" : "Rubrica"}
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                className="h-12 flex-1 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3"
                value={form.customerName}
                onChange={(e) => setField("customerName", e.target.value)}
                placeholder="Nome cliente"
              />
              {form.customerName && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12 shrink-0 px-0"
                  onClick={() => setField("customerName", "")}
                  aria-label="Cancella Cliente"
                >
                  ×
                </Button>
              )}
            </div>
            {showCustomerPicker && (
              <div className="mt-2">
                <CounterCustomerPicker recentCustomers={recentCustomers} onSelect={applyCustomer} />
              </div>
            )}
          </div>
          {form.channel === "DELIVERY" && (
            <>
              <Field label="Indirizzo" value={form.address} onChange={(v) => setField("address", v)} />
              {brokers.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Broker</label>
                  <select
                    className="h-12 w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3"
                    value={form.broker}
                    onChange={(e) => setField("broker", e.target.value)}
                  >
                    <option value="">Telefono / diretto</option>
                    {brokers.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <Field label="Telefono" value={form.phone} onChange={(v) => setField("phone", v)} />
          <div>
            <label className="mb-1 block text-sm font-medium">Nota</label>
            <textarea
              className="min-h-[88px] w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 p-4 text-sm">
            <p>
              <span className="text-[hsl(var(--pg-muted-foreground))]">Tipo ordine: </span>
              <strong>{orderTypeLabel}</strong>
            </p>
            <p>
              <span className="text-[hsl(var(--pg-muted-foreground))]">Ora: </span>
              <strong>{timeLabel}</strong>
            </p>
          </div>
        </section>
      </div>

      {error && (
        <p className="shrink-0 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      <footer
        className={`flex shrink-0 items-center justify-end gap-2 border-t border-[hsl(var(--pg-border))] p-3 ${
          embedded ? "bg-[hsl(var(--pg-background))]" : "bg-[hsl(var(--pg-primary))]/10 p-4"
        }`}
      >
        <Button
          variant="outline"
          className={embedded ? "h-10 min-w-[96px]" : "h-12 min-w-[120px]"}
          onClick={onClose}
          disabled={loading}
        >
          Chiudi
        </Button>
        <Button
          className={embedded ? "h-10 min-w-[96px]" : "h-12 min-w-[120px]"}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? "…" : "Ok"}
        </Button>
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          className="h-12 flex-1 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-12 shrink-0 px-0"
            onClick={() => onChange("")}
            aria-label={`Cancella ${label}`}
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
}
