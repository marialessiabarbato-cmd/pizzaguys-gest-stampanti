import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "../components/BottomSheet";
import { CounterCustomerPicker } from "../components/CounterCustomerPicker";
import { edgeApi } from "../lib/api";
import {
  type CounterCustomerSelection,
  dedupeRecentCustomers,
} from "../lib/counter-customers";
import type { LiveTable, Operator } from "../lib/types";

export type CounterChannel = "TAKEAWAY" | "DELIVERY";

export type CounterOrderRow = {
  id: string;
  displayNumber: string;
  channel: CounterChannel;
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  broker?: string | null;
  notes?: string | null;
  asap: boolean;
  scheduledAt?: string | null;
  scheduledLabel?: string;
  status: string;
  total: number;
  lineCount: number;
};

type CreateForm = {
  channel: CounterChannel;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  broker: string;
  asap: boolean;
  hour: number;
  minute: number;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function defaultForm(channel: CounterChannel): CreateForm {
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
    minute: (Math.ceil(now.getMinutes() / 5) * 5) % 60,
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

export function CounterOrdersScreen({
  operator,
  isOffline,
  message,
  onBack,
  onOpenOrder,
  onMessage,
}: {
  operator: Operator;
  isOffline: boolean;
  message: string;
  onBack: () => void;
  onOpenOrder: (table: LiveTable) => void;
  onMessage: (msg: string) => void;
}) {
  const [channel, setChannel] = useState<CounterChannel | "ALL">("ALL");
  const [orders, setOrders] = useState<CounterOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(() => defaultForm("TAKEAWAY"));
  const [brokers, setBrokers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const loadOrders = useCallback(() => {
    setLoading(true);
    const qs =
      channel === "ALL" ? "" : `?channel=${channel === "TAKEAWAY" ? "TAKEAWAY" : "DELIVERY"}`;
    void edgeApi<CounterOrderRow[]>(`/api/pos/counter-orders${qs}`)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [channel]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void edgeApi<{ snapshot?: { settings?: { deliveryBrokers?: string[] } } }>("/api/menu").then(
      (m) => setBrokers(m.snapshot?.settings?.deliveryBrokers ?? []),
    );
  }, []);

  const recentCustomers = useMemo(() => dedupeRecentCustomers(orders), [orders]);

  const timeLabel = useMemo(
    () => (form.asap ? "Il prima possibile" : formatTimeLabel(form.hour, form.minute)),
    [form.asap, form.hour, form.minute],
  );

  const openCreate = (ch: CounterChannel) => {
    setForm(defaultForm(ch));
    setError("");
    setShowCustomerPicker(false);
    setShowCreate(true);
  };

  const setField = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
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

  const createOrder = async () => {
    if (isOffline) {
      setError("Offline — riprova quando sei connesso");
      return;
    }
    if (!form.asap && !buildScheduledAt(false, form.hour, form.minute)) {
      setError("Seleziona un orario valido");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const result = await edgeApi<{
        order: {
          id: string;
          displayNumber: string;
          virtualType: string;
          channel: CounterChannel;
        };
      }>("/api/pos/counter-orders", {
        method: "POST",
        body: JSON.stringify({
          channel: form.channel,
          customerName: form.customerName.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.channel === "DELIVERY" ? form.address.trim() || undefined : undefined,
          notes: form.notes.trim() || undefined,
          broker: form.channel === "DELIVERY" ? form.broker.trim() || undefined : undefined,
          asap: form.asap,
          scheduledAt: buildScheduledAt(form.asap, form.hour, form.minute),
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
        }),
      });
      const table: LiveTable = {
        id: result.order.id,
        label: result.order.displayNumber,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        defaultGuests: 1,
        status: "OCCUPIED",
        isVirtual: true,
        virtualType: result.order.virtualType,
      };
      setShowCreate(false);
      onMessage(`Ordine ${result.order.displayNumber} aperto — senza pagamento`);
      onOpenOrder(table);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore creazione ordine");
    } finally {
      setCreating(false);
    }
  };

  const openExisting = (order: CounterOrderRow) => {
    const table: LiveTable = {
      id: order.id,
      label: order.displayNumber,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      defaultGuests: 1,
      status: (order.status as LiveTable["status"]) || "OCCUPIED",
      isVirtual: true,
      virtualType: order.channel === "DELIVERY" ? "DELIVERY" : "ASPORTO",
    };
    onOpenOrder(table);
  };

  return (
    <div className="flex h-dvh flex-col bg-[hsl(var(--pg-background))]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Asporto / Delivery</h1>
          <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
            {operator.firstName} {operator.lastName}
          </p>
        </div>
        <Button variant="outline" className="h-10 shrink-0" onClick={onBack}>
          Mappa
        </Button>
      </header>

      {message && (
        <p className="shrink-0 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))] px-4 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="flex shrink-0 gap-2 border-b border-[hsl(var(--pg-border))] p-3">
        {(
          [
            { id: "ALL" as const, label: "Tutti" },
            { id: "TAKEAWAY" as const, label: "Asporto" },
            { id: "DELIVERY" as const, label: "Delivery" },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setChannel(f.id)}
            className={`min-h-10 flex-1 rounded-xl text-sm font-medium ${
              channel === f.id
                ? "bg-[hsl(var(--pg-primary))] text-white"
                : "bg-[hsl(var(--pg-muted))]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 gap-2 p-3">
        <Button
          className="min-h-12 flex-1"
          disabled={isOffline}
          onClick={() => openCreate("TAKEAWAY")}
        >
          + Asporto
        </Button>
        <Button
          className="min-h-12 flex-1"
          variant="outline"
          disabled={isOffline}
          onClick={() => openCreate("DELIVERY")}
        >
          + Delivery
        </Button>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-[hsl(var(--pg-border))]">
        {loading ? (
          <li className="p-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Caricamento…
          </li>
        ) : orders.length === 0 ? (
          <li className="p-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun ordine aperto
          </li>
        ) : (
          orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => openExisting(o)}
                className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-[hsl(var(--pg-muted))]/40"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {o.displayNumber}
                    <span className="ml-2 text-xs font-medium text-[hsl(var(--pg-muted-foreground))]">
                      {o.channel === "DELIVERY" ? "Delivery" : "Asporto"}
                    </span>
                  </p>
                  <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
                    {o.customerName || "Cliente"}
                    {o.phone ? ` · ${o.phone}` : ""}
                    {o.broker ? ` · ${o.broker}` : ""}
                    {o.scheduledLabel ? ` · ${o.scheduledLabel}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium tabular-nums">€ {o.total.toFixed(2)}</p>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {o.lineCount} {o.lineCount === 1 ? "riga" : "righe"}
                  </p>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>

      {showCreate && (
        <BottomSheet maxHeightClass="max-h-[90dvh]">
            <div className="border-b border-[hsl(var(--pg-border))] px-4 pb-3 pt-1">
              <h2 className="text-center text-lg font-bold">
                Nuovo {form.channel === "DELIVERY" ? "delivery" : "asporto"}
              </h2>
              <p className="mt-1 text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
                Stesso caricamento cliente della cassa · nessun pagamento qui
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="min-h-12"
                  variant={form.asap ? "default" : "outline"}
                  onClick={() => setField("asap", true)}
                >
                  Il prima possibile
                </Button>
                <Button
                  type="button"
                  className="min-h-12"
                  variant={!form.asap ? "default" : "outline"}
                  onClick={() => setField("asap", false)}
                >
                  {form.asap ? "Scegli orario" : `Ora ${timeLabel}`}
                </Button>
              </div>

              {!form.asap && (
                <>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                      Ora
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                      {HOURS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className={`min-h-11 rounded-xl text-sm font-semibold ${
                            form.hour === h
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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                      Minuti
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                      {MINUTES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`min-h-11 rounded-xl text-sm font-semibold ${
                            form.minute === m
                              ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                              : "bg-[hsl(var(--pg-muted))]"
                          }`}
                          onClick={() => setForm((prev) => ({ ...prev, asap: false, minute: m }))}
                        >
                          {String(m).padStart(2, "0")}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {form.channel === "DELIVERY" && brokers.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Broker</label>
                  <select
                    className="min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3 text-base"
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

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-sm font-medium">Cliente</label>
                  <Button
                    type="button"
                    variant={showCustomerPicker ? "default" : "outline"}
                    className="min-h-10 px-3 text-sm"
                    onClick={() => setShowCustomerPicker((open) => !open)}
                  >
                    {showCustomerPicker ? "Chiudi rubrica" : "Rubrica"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="min-h-12 flex-1 rounded-xl border border-[hsl(var(--pg-border))] px-3 text-base"
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
                      aria-label="Cancella cliente"
                    >
                      ×
                    </Button>
                  )}
                </div>
                {showCustomerPicker && (
                  <div className="mt-2">
                    <CounterCustomerPicker
                      recentCustomers={recentCustomers}
                      onSelect={applyCustomer}
                    />
                  </div>
                )}
              </div>

              <Field
                label="Telefono"
                value={form.phone}
                onChange={(v) => setField("phone", v)}
                inputMode="tel"
              />

              {form.channel === "DELIVERY" && (
                <Field
                  label="Indirizzo"
                  value={form.address}
                  onChange={(v) => setField("address", v)}
                />
              )}

              <div>
                <label className="mb-1 block text-sm font-medium">Nota</label>
                <textarea
                  className="min-h-[80px] w-full rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2 text-base"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className={bottomSheetFooterClass}>
              <Button
                type="button"
                variant="ghost"
                className="min-h-12 flex-1"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Annulla
              </Button>
              <Button
                type="button"
                className="min-h-12 flex-1 font-semibold"
                disabled={creating || isOffline}
                onClick={() => void createOrder()}
              >
                {creating ? "..." : "Apri comanda"}
              </Button>
            </div>
        </BottomSheet>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "tel" | "text" | "numeric" | "search";
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          className="min-h-12 flex-1 rounded-xl border border-[hsl(var(--pg-border))] px-3"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
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
