import { Button, Card, CardContent, CardHeader, CardTitle, describeEdgeError } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";

interface PairedDevice {
  id: string;
  name: string;
  kind: string;
  pairedAt: string;
  pairedByName: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  clientVersion: string | null;
  revokedAt: string | null;
  connected: boolean;
}

const KIND_LABELS: Record<string, string> = { handheld: "Palmare", cassa: "Cassa / tablet", kds: "KDS" };

function ago(iso: string | null): string {
  if (!iso) return "mai";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

/**
 * Dispositivi abbinati alla cassa (palmari, KDS, tablet). Ogni device si abbina una volta con
 * il PIN; da qui l'Admin lo rinomina o lo scollega (es. telefono perso o cambiato).
 */
export function DevicesPage() {
  const [list, setList] = useState<PairedDevice[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PairedDevice | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await edgeApi<PairedDevice[]>("/api/devices"));
    } catch (e) {
      setMessage({ text: describeEdgeError(e), error: true });
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const rename = async () => {
    if (!editing) return;
    try {
      await edgeApi(`/api/devices/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: editing.name }) });
      setEditing(null);
      setMessage({ text: "Nome salvato" });
      await load();
    } catch (e) {
      setMessage({ text: describeEdgeError(e), error: true });
    }
  };

  const revoke = async (d: PairedDevice) => {
    try {
      await edgeApi(`/api/devices/${d.id}/revoke`, { method: "POST", body: "{}" });
      setConfirmRevoke(null);
      setMessage({ text: `${d.name} scollegato: per riusarlo bisogna riabbinarlo con il PIN.` });
      await load();
    } catch (e) {
      setMessage({ text: describeEdgeError(e), error: true });
    }
  };

  const active = list.filter((d) => !d.revokedAt);
  const revoked = list.filter((d) => d.revokedAt);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dispositivi abbinati</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Palmari, KDS e tablet funzionano solo se abbinati: al primo accesso basta il PIN (per i KDS serve il PIN di
            un cassiere o dell&apos;Admin). Se un telefono viene perso o sostituito, scollegalo da qui.
          </p>
          {message && (
            <p className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
          )}
          {active.length === 0 ? (
            <p className="text-sm">Nessun dispositivo abbinato.</p>
          ) : (
            <div className="overflow-auto rounded-lg border border-[hsl(var(--pg-border))]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[hsl(var(--pg-muted))] text-left text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Stato</th>
                    <th className="px-3 py-2">Indirizzo</th>
                    <th className="px-3 py-2">Abbinato</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => (
                    <tr key={d.id} className="border-t border-[hsl(var(--pg-border))]">
                      <td className="px-3 py-2 font-medium">
                        {editing?.id === d.id ? (
                          <span className="flex gap-2">
                            <input
                              className="w-40 rounded border border-[hsl(var(--pg-border))] bg-transparent px-2 py-1"
                              value={editing.name}
                              maxLength={60}
                              autoFocus
                              onChange={(e) => setEditing({ id: d.id, name: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && void rename()}
                            />
                            <Button className="h-8 px-2 text-xs" onClick={() => void rename()}>
                              Salva
                            </Button>
                          </span>
                        ) : (
                          d.name
                        )}
                      </td>
                      <td className="px-3 py-2">{KIND_LABELS[d.kind] ?? d.kind}</td>
                      <td className="px-3 py-2">
                        {d.connected ? (
                          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700">
                            Collegato
                          </span>
                        ) : (
                          <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                            Ultimo contatto {ago(d.lastSeenAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {d.lastIp ?? "—"}
                        {d.clientVersion && (
                          <span className="block text-[hsl(var(--pg-muted-foreground))]">{d.clientVersion}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {new Date(d.pairedAt).toLocaleDateString("it-IT")}
                        {d.pairedByName && <span className="block">da {d.pairedByName}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex gap-2">
                          <Button
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            onClick={() => setEditing({ id: d.id, name: d.name })}
                          >
                            Rinomina
                          </Button>
                          <Button
                            variant="outline"
                            className="h-8 px-2 text-xs text-red-600"
                            onClick={() => setConfirmRevoke(d)}
                          >
                            Scollega
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {confirmRevoke && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200">
              <p>
                Scollegare <strong>{confirmRevoke.name}</strong>? Smette subito di funzionare; per riusarlo bisognerà
                riabbinarlo con il PIN.
              </p>
              <div className="mt-2 flex gap-2">
                <Button className="h-8 bg-red-600 px-3 text-xs text-white hover:bg-red-700" onClick={() => void revoke(confirmRevoke)}>
                  Scollega
                </Button>
                <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => setConfirmRevoke(null)}>
                  Annulla
                </Button>
              </div>
            </div>
          )}
          {revoked.length > 0 && (
            <details className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              <summary>Scollegati ({revoked.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {revoked.map((d) => (
                  <li key={d.id}>
                    {d.name} · {KIND_LABELS[d.kind] ?? d.kind} · scollegato il{" "}
                    {new Date(d.revokedAt as string).toLocaleDateString("it-IT")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
