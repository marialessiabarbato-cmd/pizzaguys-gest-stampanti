import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import type { PrinterHealth } from "@pizzaguys/types";
import { edgeApi } from "@/lib/api";
import { PrinterHealthList, PrintQueueList } from "@/components/PrintQueuePanel";

interface Printer {
  id: string;
  name: string;
  workCenter: string;
  host: string;
  port: number;
  enabled: boolean;
  fallbackPrinterId: string | null;
}

type Draft = { host: string; port: string };

const inputClass =
  "w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2";

export function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<PrinterHealth[]>([]);

  const loadHealth = async (refresh = false) => {
    const res = await edgeApi<{ printers: PrinterHealth[] }>(`/api/printers/status${refresh ? "?refresh=1" : ""}`);
    setHealth(res.printers);
  };

  useEffect(() => {
    void loadHealth().catch(() => undefined);
    const id = setInterval(() => void loadHealth().catch(() => undefined), 10_000);
    return () => clearInterval(id);
  }, []);

  const setFallback = async (p: Printer, fallbackPrinterId: string) => {
    try {
      await edgeApi(`/api/printers/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fallbackPrinterId: fallbackPrinterId || null }),
      });
      const fb = printers.find((x) => x.id === fallbackPrinterId);
      const sameAddress = fb && fb.host === p.host && fb.port === p.port;
      setMessage({
        text: fb
          ? `${p.name}: se è ferma i ticket escono su ${fb.name}${sameAddress ? " — attenzione: è la stessa stampante (stesso IP), la riserva non servirà finché non ha un IP diverso" : ""}`
          : `${p.name}: nessuna stampante di riserva`,
        error: !!sameAddress,
      });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Errore salvataggio", error: true });
    }
  };

  const load = async () => {
    const list = await edgeApi<Printer[]>("/api/printers");
    setPrinters(list);
    setDrafts(Object.fromEntries(list.map((p) => [p.id, { host: p.host, port: String(p.port) }])));
  };

  useEffect(() => {
    void load();
  }, []);

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const isDirty = (p: Printer) => {
    const d = drafts[p.id];
    return !!d && (d.host.trim() !== p.host || d.port.trim() !== String(p.port));
  };

  const saveTo = async (ids: string[], draft: Draft, label: string) => {
    const port = Number(draft.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setMessage({ text: "Porta non valida (1–65535, di solito 9100)", error: true });
      return;
    }
    setBusy(label);
    try {
      for (const id of ids) {
        await edgeApi(`/api/printers/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ host: draft.host.trim(), port }),
        });
      }
      setMessage({ text: `${label}: salvato ${draft.host.trim()}:${port}` });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Errore salvataggio", error: true });
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = async (p: Printer) => {
    await edgeApi(`/api/printers/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    setMessage({ text: `${p.name}: ${p.enabled ? "disattivata" : "attivata"}` });
    await load();
  };

  const testPrint = async (p: Printer) => {
    setBusy(`test-${p.id}`);
    try {
      const res = await edgeApi<{ success: boolean; filePath?: string; error?: string }>(
        `/api/printers/${p.id}/test`,
        { method: "POST" },
      );
      if (!res.success) {
        setMessage({ text: `${p.name}: stampa di prova non riuscita — ${res.error ?? "errore"}`, error: true });
      } else if (res.filePath) {
        setMessage({ text: `${p.name}: modalità simulata, ticket salvato in ${res.filePath}` });
      } else {
        setMessage({ text: `${p.name}: stampa di prova inviata a ${p.host}:${p.port}` });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stampanti</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Indirizzo IP e porta della stampante termica di ogni centro (porta standard 9100).
        </p>
      </div>
      {message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            message.error
              ? "bg-[hsl(var(--pg-danger))]/10 text-[hsl(var(--pg-danger))]"
              : "bg-[hsl(var(--pg-muted))]"
          }`}
        >
          {message.text}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Stato</span>
            <Button variant="outline" className="h-9" onClick={() => void loadHealth(true)}>
              Controlla ora
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PrinterHealthList printers={health} />
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {printers.map((p) => {
          const d = drafts[p.id] ?? { host: p.host, port: String(p.port) };
          return (
            <Card key={p.id} className={p.enabled ? "" : "opacity-60"}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{p.name}</span>
                  <span className="text-xs font-normal text-[hsl(var(--pg-muted-foreground))]">
                    {p.workCenter}
                    {p.enabled ? "" : " · disattivata"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">Indirizzo IP</span>
                    <input
                      className={inputClass}
                      aria-label={`Indirizzo IP ${p.name}`}
                      inputMode="decimal"
                      value={d.host}
                      onChange={(e) => setDraft(p.id, { host: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">Porta</span>
                    <input
                      className={inputClass}
                      aria-label={`Porta ${p.name}`}
                      inputMode="numeric"
                      value={d.port}
                      onChange={(e) => setDraft(p.id, { port: e.target.value })}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    Stampante di riserva (se questa è ferma: carta finita, spenta…)
                  </span>
                  <select
                    className={inputClass}
                    aria-label={`Stampante di riserva per ${p.name}`}
                    value={p.fallbackPrinterId ?? ""}
                    onChange={(e) => void setFallback(p, e.target.value)}
                  >
                    <option value="">Nessuna (i ticket restano in attesa e si ritentano)</option>
                    {printers
                      .filter((x) => x.id !== p.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.host}:{x.port}){x.enabled ? "" : " · disattivata"}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!isDirty(p) || busy !== null}
                    onClick={() => void saveTo([p.id], d, p.name)}
                  >
                    Salva
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void saveTo(printers.map((x) => x.id), d, "Tutte le stampanti")}
                  >
                    Applica a tutte
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy !== null || isDirty(p)}
                    onClick={() => void testPrint(p)}
                  >
                    {busy === `test-${p.id}` ? "Stampa in corso…" : "Stampa di prova"}
                  </Button>
                  <Button variant="outline" disabled={busy !== null} onClick={() => void toggleEnabled(p)}>
                    {p.enabled ? "Disattiva" : "Attiva"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coda di stampa (ultimi 7 giorni)</CardTitle>
        </CardHeader>
        <CardContent>
          <PrintQueueList compact />
        </CardContent>
      </Card>
    </div>
  );
}
