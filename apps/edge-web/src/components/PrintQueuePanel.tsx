import { Button } from "@pizzaguys/ui";
import type { PrinterHealth } from "@pizzaguys/types";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

export interface PrintJobRow {
  id: string;
  kind: string;
  tableLabel: string;
  printerId: string;
  printerName: string;
  printedOnName: string | null;
  status: "QUEUED" | "PRINTED" | "REROUTED" | "RETRYING" | "FAILED" | "CANCELLED";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  printedAt: string | null;
  reprintOf: string | null;
}

const KIND_LABELS: Record<string, string> = {
  COMANDA: "Comanda",
  MARCIA: "Marcia",
  DOLCI: "Dolci",
  ANNULLO: "Annullo",
  PRECONTO: "Preconto",
  COPIA_SCONTRINO: "Copia scontrino",
  CHIUSURA_CASSA: "Chiusura cassa",
  COPIA_CASSA: "Copia comanda",
  PRENOTAZIONI: "Prenotazioni",
};

const STATUS: Record<PrintJobRow["status"], { label: string; className: string }> = {
  QUEUED: { label: "In invio", className: "bg-[hsl(var(--pg-muted))]" },
  PRINTED: { label: "Stampato", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  REROUTED: { label: "Dirottato", className: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300" },
  RETRYING: { label: "In attesa", className: "bg-orange-500/20 text-orange-800 dark:text-orange-300" },
  FAILED: { label: "Non stampato", className: "bg-[hsl(var(--pg-danger))]/15 text-[hsl(var(--pg-danger))]" },
  CANCELLED: { label: "Tolto dalla coda", className: "bg-[hsl(var(--pg-muted))] opacity-70" },
};

const CONDITION_DOT: Record<string, string> = {
  OK: "bg-green-500",
  PAPER_NEAR_END: "bg-yellow-500",
  UNKNOWN: "bg-gray-400",
};

function time(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function subject(job: PrintJobRow) {
  const kind = KIND_LABELS[job.kind] ?? job.kind;
  if (!job.tableLabel) return kind;
  return job.kind === "CHIUSURA_CASSA" || job.kind === "PRENOTAZIONI" ? `${kind} ${job.tableLabel}` : `${kind} · ${job.tableLabel}`;
}

/** Semafori delle stampanti: verde pronta, giallo carta in esaurimento, rosso ferma. */
export function PrinterHealthList({ printers }: { printers: PrinterHealth[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {printers.map((p) => (
        <li key={p.printerId} className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${CONDITION_DOT[p.condition] ?? "bg-[hsl(var(--pg-danger))]"}`}
            aria-hidden
          />
          <span className="font-medium">{p.name}</span>
          <span className="text-[hsl(var(--pg-muted-foreground))]">
            {p.message}
            {p.pendingJobs > 0 ? ` · ${p.pendingJobs} in attesa` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Coda di stampa (R3): ultimi ticket con stato, ristampa di qualsiasi ticket
 * (anche su un'altra stampante) e rimozione di quelli in attesa.
 */
export function PrintQueueList({ compact = false }: { compact?: boolean }) {
  const [jobs, setJobs] = useState<PrintJobRow[]>([]);
  const [printers, setPrinters] = useState<PrinterHealth[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [target, setTarget] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [j, s] = await Promise.all([
      edgeApi<{ jobs: PrintJobRow[] }>(
        onlyProblems ? "/api/print-jobs?status=RETRYING,FAILED,REROUTED&limit=100" : "/api/print-jobs?limit=60",
      ),
      edgeApi<{ printers: PrinterHealth[] }>("/api/printers/status"),
    ]);
    setJobs(j.jobs);
    setPrinters(s.printers);
  }, [onlyProblems]);

  useEffect(() => {
    void load().catch(() => setMessage({ text: "Coda di stampa non disponibile", error: true }));
    const id = setInterval(() => void load().catch(() => undefined), 5000);
    return () => clearInterval(id);
  }, [load]);

  const reprint = async (job: PrintJobRow) => {
    setBusy(job.id);
    try {
      const printerId = target[job.id] || undefined;
      const res = await edgeApi<{ ok: boolean; status: string; reroutedTo?: string; error?: string }>(
        `/api/print-jobs/${job.id}/reprint`,
        { method: "POST", body: JSON.stringify(printerId ? { printerId } : {}) },
      );
      if (res.ok) {
        setMessage({ text: `${subject(job)}: ristampato${res.reroutedTo ? ` su ${res.reroutedTo}` : ""}` });
      } else {
        setMessage({
          text: `${subject(job)}: ristampa non riuscita (${res.error ?? "errore"}), resta in attesa`,
          error: true,
        });
      }
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Ristampa non riuscita", error: true });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (job: PrintJobRow) => {
    setBusy(job.id);
    try {
      await edgeApi(`/api/print-jobs/${job.id}/cancel`, { method: "POST" });
      setMessage({ text: `${subject(job)}: tolto dalla coda` });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Operazione non riuscita", error: true });
    } finally {
      setBusy(null);
    }
  };

  const enabledPrinters = printers.filter((p) => p.message !== "disattivata");

  return (
    <div className="space-y-3">
      {!compact && <PrinterHealthList printers={printers} />}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
        Solo ticket in attesa, dirottati o non stampati
      </label>
      {message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            message.error ? "bg-[hsl(var(--pg-danger))]/10 text-[hsl(var(--pg-danger))]" : "bg-[hsl(var(--pg-muted))]"
          }`}
        >
          {message.text}
        </p>
      )}
      {jobs.length === 0 && (
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun ticket da mostrare.</p>
      )}
      <ul className="divide-y divide-[hsl(var(--pg-border))]">
        {jobs.map((job) => {
          const st = STATUS[job.status];
          const printedOn = job.printedOnName && job.printedOnName !== job.printerName ? job.printedOnName : null;
          return (
            <li key={job.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-[hsl(var(--pg-muted-foreground))]">{time(job.createdAt)}</span>
                <span className="font-medium">{subject(job)}</span>
                {job.reprintOf && <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">(ristampa)</span>}
                <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
              </div>
              <div className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                {job.printerName}
                {printedOn ? ` → stampato su ${printedOn}` : ""}
                {job.lastError && job.status !== "PRINTED" ? ` · ${job.lastError}` : ""}
                {job.attempts > 1 ? ` · ${job.attempts} tentativi` : ""}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Stampante per la ristampa"
                  className="min-h-10 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                  value={target[job.id] ?? ""}
                  onChange={(e) => setTarget((prev) => ({ ...prev, [job.id]: e.target.value }))}
                >
                  <option value="">Stessa stampante</option>
                  {enabledPrinters
                    .filter((p) => p.printerId !== job.printerId)
                    .map((p) => (
                      <option key={p.printerId} value={p.printerId}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  className="min-h-10"
                  disabled={busy !== null}
                  onClick={() => void reprint(job)}
                >
                  {busy === job.id ? "Invio…" : job.status === "RETRYING" || job.status === "FAILED" ? "Stampa ora" : "Ristampa"}
                </Button>
                {job.status === "RETRYING" && (
                  <Button variant="outline" className="min-h-10" disabled={busy !== null} onClick={() => void cancel(job)}>
                    Togli dalla coda
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PrintQueuePanel({ onClose }: { onClose: () => void }) {
  return (
    <OffCanvas widthClass="max-w-lg" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-3 text-lg font-bold">Coda di stampa</h2>
        <PrintQueueList />
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </OffCanvas>
  );
}
