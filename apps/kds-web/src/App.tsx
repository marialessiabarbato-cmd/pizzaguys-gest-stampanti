import { Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { useEdgeWs } from "./lib/ws";

interface KdsTicket {
  id: string;
  orderId: string;
  tableId: string;
  tableLabel: string;
  course: number;
  lines: { name: string; quantity: number; variants?: string[] }[];
  submittedAt: string;
  hold: boolean;
  dessertQueue: boolean;
  courseCalledAt?: string;
}

interface KdsCancellation {
  id: string;
  tableLabel: string;
  course: number;
  itemName: string;
  quantity: number;
  cancelledAt: string;
}

interface KdsSnapshot {
  tickets: KdsTicket[];
  cancellations: KdsCancellation[];
}

function isRecentlyCalled(courseCalledAt?: string): boolean {
  if (!courseCalledAt) return false;
  return Date.now() - new Date(courseCalledAt).getTime() < 60_000;
}

function formatElapsed(submittedAt: string): string {
  const sec = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function applySnapshot(
  data: KdsSnapshot | KdsTicket[],
  setTickets: (t: KdsTicket[]) => void,
  setCancellations: (c: KdsCancellation[]) => void,
) {
  if (Array.isArray(data)) {
    setTickets(data);
    return;
  }
  setTickets(data.tickets ?? []);
  setCancellations(data.cancellations ?? []);
}

export default function App() {
  const { connected, on } = useEdgeWs();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [cancellations, setCancellations] = useState<KdsCancellation[]>([]);
  const [, tick] = useState(0);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_EDGE_API_URL ?? "http://localhost:4100"}/api/kds/tickets`,
      );
      if (res.ok) {
        const data = (await res.json()) as KdsSnapshot | KdsTicket[];
        applySnapshot(data, setTickets, setCancellations);
      }
    } catch {
      /* edge offline */
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const unsub = on("KDS_ORDER_UPDATE", (payload) => {
      const p = payload as KdsSnapshot & { tickets?: KdsTicket[] };
      if (p.tickets) {
        applySnapshot(p, setTickets, setCancellations);
      } else {
        void loadTickets();
      }
    });
    return () => {
      unsub();
    };
  }, [on, loadTickets]);

  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const active = tickets.filter((t) => !t.hold && !t.dessertQueue);
  const held = tickets.filter((t) => t.hold || t.dessertQueue);
  const recentCancellations = cancellations.filter(
    (c) => Date.now() - new Date(c.cancelledAt).getTime() < 600_000,
  );

  return (
    <main className="min-h-screen bg-[hsl(var(--pg-background))] p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">KDS — Pizzeria</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Griglia ordini live</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${connected ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"}`}>
          {connected ? "WS connesso" : "WS disconnesso"}
        </span>
      </header>

      {recentCancellations.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">
            Annullamenti
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentCancellations.map((c) => (
              <Card
                key={c.id}
                className="border-2 border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/30"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base text-white">
                    <span>=== ANNULLO ===</span>
                    <span className="font-mono text-sm">{formatClock(c.cancelledAt)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">Tavolo {c.tableLabel}</p>
                  <p className="mt-1 text-base">
                    {c.quantity}× {c.itemName}
                  </p>
                  <p className="mt-2 text-xs uppercase opacity-90">Portata {c.course}</p>
                  <p className="mt-2 text-xs font-semibold uppercase">Verificare con la sala</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">In preparazione</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 && (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun ordine attivo</p>
        )}
        {active.map((ticket) => {
          const urgent = isRecentlyCalled(ticket.courseCalledAt);
          return (
          <Card
            key={ticket.id}
            className={urgent ? "border-2 border-[hsl(var(--pg-warning))] shadow-lg shadow-[hsl(var(--pg-warning))]/20" : undefined}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tavolo {ticket.tableLabel}</span>
                <span className="font-mono text-base">{formatElapsed(ticket.submittedAt)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {urgent && (
                <p className="mb-2 text-sm font-bold uppercase text-[hsl(var(--pg-warning))]">
                  CHIAMA PORTATA {ticket.course}
                </p>
              )}
              <p className="mb-2 text-xs uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                Portata {ticket.course}
              </p>
              <ul className="space-y-1 text-sm">
                {ticket.lines.map((item, i) => (
                  <li key={`${ticket.id}-${i}`}>
                    {item.quantity}× {item.name}
                    {item.variants?.length ? (
                      <span className="block text-xs text-[hsl(var(--pg-muted-foreground))]">
                        {item.variants.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          );
        })}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">In attesa (HOLD / Dolci)</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {held.length === 0 && (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun ordine in hold</p>
        )}
        {held.map((ticket) => (
          <Card key={ticket.id} className="opacity-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tavolo {ticket.tableLabel}</span>
                <span className="font-mono text-base">{formatElapsed(ticket.submittedAt)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs uppercase tracking-wide text-orange-600">
                {ticket.dessertQueue ? "[X DOLCE] " : "[HOLD] "}
                Portata {ticket.course}
              </p>
              <ul className="space-y-1 text-sm">
                {ticket.lines.map((item, i) => (
                  <li key={`${ticket.id}-h-${i}`}>
                    {item.quantity}× {item.name}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
