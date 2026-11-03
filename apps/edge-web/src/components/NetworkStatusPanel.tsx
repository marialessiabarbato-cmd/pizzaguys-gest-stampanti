import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

export type NetLevel = "ok" | "info" | "warning" | "error";

interface NetItem {
  id: string;
  group: "edge" | "cloud" | "fiscal" | "printer" | "device" | "security";
  label: string;
  level: NetLevel;
  message: string;
  action?: string;
}

export interface NetworkStatus {
  checkedAt: string;
  overall: NetLevel;
  addresses: string[];
  hostname: string;
  mdnsName: string | null;
  referenceBuild: string | null;
  items: NetItem[];
}

const GROUPS: { id: NetItem["group"]; title: string }[] = [
  { id: "edge", title: "Cassa" },
  { id: "printer", title: "Stampanti" },
  { id: "device", title: "Palmari e KDS" },
  { id: "cloud", title: "Cloud" },
  { id: "fiscal", title: "Cassa fiscale" },
  { id: "security", title: "Sicurezza" },
];

export const LEVEL_DOT: Record<NetLevel, string> = {
  ok: "bg-green-500",
  info: "bg-slate-400",
  warning: "bg-amber-500",
  error: "bg-[hsl(var(--pg-danger))]",
};

const RANK: Record<NetLevel, number> = { ok: 0, info: 1, warning: 2, error: 3 };
function worstRank(items: NetItem[]): number {
  // info conta come ok per l'ordine: solo avvisi ed errori salgono in cima
  return items.reduce((w, i) => Math.max(w, i.level === "info" ? 0 : RANK[i.level]), 0);
}

const OVERALL_TEXT: Record<NetLevel, string> = {
  ok: "Tutto funziona",
  info: "Tutto funziona (alcune note)",
  warning: "Qualcosa da controllare",
  error: "C'è un problema da risolvere",
};

/** Stato rete letto dall'Edge ogni `intervalMs` (solo per l'indicatore in testata). */
export function useNetworkStatus(enabled: boolean, intervalMs = 30_000) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      edgeApi<NetworkStatus>("/api/network-status")
        .then((s) => alive && setStatus(s))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, intervalMs]);
  return status;
}

/** Elenco dei semafori con messaggio e cosa fare. Usato nel pannello della cassa e nelle Impostazioni. */
export function NetworkStatusView({ onOpenPrintQueue }: { onOpenPrintQueue?: () => void }) {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      const s = await edgeApi<NetworkStatus>(`/api/network-status${refresh ? "?refresh=1" : ""}`);
      setStatus(s);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stato rete non disponibile");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !status) {
    return <p className="rounded-md bg-[hsl(var(--pg-danger))]/10 px-3 py-2 text-sm text-[hsl(var(--pg-danger))]">{error}</p>;
  }
  if (!status) return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Controllo in corso…</p>;

  const checked = new Date(status.checkedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const hasPrinterIssue = status.items.some((i) => i.group === "printer" && (i.level === "error" || i.level === "warning"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--pg-border))] p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-4 w-4 shrink-0 rounded-full ${LEVEL_DOT[status.overall]}`} aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold">{OVERALL_TEXT[status.overall]}</p>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              Controllato alle {checked}
              {status.mdnsName
                ? ` · palmari su http://${status.mdnsName}:5174${status.addresses[0] ? ` (o http://${status.addresses[0]}:5174)` : ""}`
                : status.addresses.length > 0 && ` · palmari su http://${status.addresses[0]}:5174`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-10 shrink-0"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await load(true);
            setBusy(false);
          }}
        >
          {busy ? "Controllo…" : "Controlla ora"}
        </Button>
      </div>

      {/* Gruppi con problemi in cima: chi apre il pannello vede subito cosa sistemare */}
      {[...GROUPS]
        .map((g, order) => ({ g, order, rank: worstRank(status.items.filter((i) => i.group === g.id)) }))
        .sort((a, b) => b.rank - a.rank || a.order - b.order)
        .map(({ g }) => {
        const items = status.items.filter((i) => i.group === g.id);
        if (items.length === 0) return null;
        return (
          <section key={g.id}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--pg-muted-foreground))]">
              {g.title}
            </h3>
            <ul className="divide-y divide-[hsl(var(--pg-border))] overflow-hidden rounded-xl border border-[hsl(var(--pg-border))]">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3 px-3 py-2.5 text-sm">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[i.level]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i.label}
                      <span className="sr-only"> — {i.level}</span>
                    </p>
                    <p className="break-words text-[hsl(var(--pg-muted-foreground))]">{i.message}</p>
                    {i.action && (
                      <p
                        className={`mt-1 break-words font-medium ${
                          i.level === "error"
                            ? "text-[hsl(var(--pg-danger))]"
                            : i.level === "warning"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-[hsl(var(--pg-muted-foreground))]"
                        }`}
                      >
                        → {i.action}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {g.id === "printer" && hasPrinterIssue && onOpenPrintQueue && (
              <Button variant="outline" className="mt-2 h-10" onClick={onOpenPrintQueue}>
                Apri la coda di stampa
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function NetworkStatusPanel({ onClose, onOpenPrintQueue }: { onClose: () => void; onOpenPrintQueue?: () => void }) {
  return (
    <OffCanvas widthClass="max-w-lg" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-3 text-lg font-bold">Stato rete</h2>
        <NetworkStatusView onOpenPrintQueue={onOpenPrintQueue} />
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </OffCanvas>
  );
}
