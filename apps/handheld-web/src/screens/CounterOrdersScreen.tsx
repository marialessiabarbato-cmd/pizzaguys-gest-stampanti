import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
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
};

function defaultForm(channel: CounterChannel): CreateForm {
  return {
    channel,
    customerName: "",
    phone: "",
    address: "",
    notes: "",
    broker: "",
    asap: true,
  };
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

  const openCreate = (ch: CounterChannel) => {
    setForm(defaultForm(ch));
    setError("");
    setShowCreate(true);
  };

  const createOrder = async () => {
    if (isOffline) {
      setError("Offline — riprova quando sei connesso");
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
          asap: true,
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
      onMessage(`Ordine ${result.order.displayNumber} aperto`);
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
                    {o.broker ? ` · ${o.broker}` : ""}
                    {o.scheduledLabel ? ` · ${o.scheduledLabel}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums font-medium">€ {o.total.toFixed(2)}</p>
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
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-[hsl(var(--pg-background))] shadow-xl sm:rounded-2xl">
            <div className="border-b border-[hsl(var(--pg-border))] px-4 py-4">
              <h2 className="text-center text-lg font-bold">
                Nuovo {form.channel === "DELIVERY" ? "delivery" : "asporto"}
              </h2>
              <p className="mt-1 text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
                Nessun pagamento in questa fase — apri la comanda
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <label className="block text-sm">
                Cliente
                <input
                  className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Nome"
                />
              </label>
              <label className="block text-sm">
                Telefono
                <input
                  className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Opzionale"
                  inputMode="tel"
                />
              </label>
              {form.channel === "DELIVERY" && (
                <>
                  <label className="block text-sm">
                    Indirizzo
                    <input
                      className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Opzionale"
                    />
                  </label>
                  <label className="block text-sm">
                    Broker
                    <select
                      className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3"
                      value={form.broker}
                      onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
                    >
                      <option value="">Nessuno / diretto</option>
                      {brokers.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="block text-sm">
                Note
                <input
                  className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Opzionale"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 border-t border-[hsl(var(--pg-border))] p-4">
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
          </div>
        </div>
      )}
    </div>
  );
}
