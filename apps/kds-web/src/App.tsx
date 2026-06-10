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
}

function formatElapsed(submittedAt: string): string {
  const sec = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const { connected, on } = useEdgeWs();
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [, tick] = useState(0);

  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_EDGE_API_URL ?? "http://localhost:4100"}/api/kds/tickets`,
      );
      if (res.ok) {
        const data = (await res.json()) as KdsTicket[];
        setTickets(data);
      }
    } catch {
      /* edge offline */
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const unsub = on("KDS_ORDER_UPDATE", (payload) => {
      const p = payload as { tickets?: KdsTicket[] };
      if (p.tickets) setTickets(p.tickets);
      else void loadTickets();
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

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">In preparazione</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 && (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun ordine attivo</p>
        )}
        {active.map((ticket) => (
          <Card key={ticket.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Tavolo {ticket.tableLabel}</span>
                <span className="font-mono text-base">{formatElapsed(ticket.submittedAt)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
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
        ))}
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
