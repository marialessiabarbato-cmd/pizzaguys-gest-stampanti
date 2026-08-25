import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { edgeApi } from "../lib/api";

interface BrokerLine {
  broker: string;
  cashAmount: number;
  cardAmount: number;
}

interface ExpenseLine {
  description: string;
  amount: number;
}

interface ExtraLine {
  label: string;
  amount: number;
}

interface InternalClosureDraft {
  closureDate: string;
  closureTotal: number;
  cashWithdrawal: number;
  posTotal: number;
  brokers: BrokerLine[];
  expenses: ExpenseLine[];
  cashFund: number;
  extraLines: ExtraLine[];
  notes?: string;
}

interface InternalClosureRecord extends InternalClosureDraft {
  id: string;
  operatorName: string;
  emailedAt?: string;
  createdAt: string;
}

type AddKind = "broker" | "expense" | "extra";

const BROKER_PRESETS = ["Glovo", "Alfonsino", "Deliveroo", "Uber Eats"] as const;

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function parseEuro(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function formatNotebook(record: InternalClosureDraft & { notes?: string }): string {
  const lines: string[] = [
    record.closureDate,
    `CHIUSURA TOT € ${record.closureTotal.toFixed(2)}`,
    `PRELIEVO CONT € ${record.cashWithdrawal.toFixed(2)}`,
    `POS € ${record.posTotal.toFixed(2)}`,
  ];
  for (const b of record.brokers) {
    const parts: string[] = [];
    if (b.cashAmount > 0) parts.push(`€ ${b.cashAmount.toFixed(2)} (CONT)`);
    if (b.cardAmount > 0) parts.push(`€ ${b.cardAmount.toFixed(2)} (CARTA)`);
    lines.push(`${b.broker.toUpperCase()} ${parts.join(" ; ")}`);
  }
  for (const e of record.expenses) {
    lines.push(`SPESE € ${e.amount.toFixed(2)} (${e.description})`);
  }
  for (const x of record.extraLines) {
    lines.push(`${x.label} € ${x.amount.toFixed(2)}`);
  }
  lines.push(`FONDO CASSA € ${record.cashFund.toFixed(2)}`);
  if (record.notes?.trim()) lines.push(`Note: ${record.notes.trim()}`);
  return lines.join("\n");
}

function NotebookRow({
  label,
  children,
  mute,
}: {
  label: string;
  children: ReactNode;
  mute?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[9.5rem_minmax(0,1fr)] items-start gap-2 border-b border-dashed border-[hsl(var(--pg-border))] py-2.5 ${
        mute ? "opacity-90" : ""
      }`}
    >
      <div className="pt-2 text-xs font-bold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InternalClosureWizard({
  operatorId,
  operatorName,
  onClose,
}: {
  operatorId: string;
  operatorName: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<InternalClosureDraft | null>(null);
  const [cashWithdrawal, setCashWithdrawal] = useState("");
  const [cashFund, setCashFund] = useState("");
  const [notes, setNotes] = useState("");
  const [brokers, setBrokers] = useState<BrokerLine[]>([]);
  const [expenses, setExpenses] = useState<ExpenseLine[]>([]);
  const [extraLines, setExtraLines] = useState<ExtraLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<InternalClosureRecord | null>(null);
  const [printMsg, setPrintMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await edgeApi<InternalClosureDraft>("/api/internal-closure/draft");
      setDraft(data);
      setCashWithdrawal(data.cashWithdrawal ? String(data.cashWithdrawal) : "");
      setCashFund(data.cashFund ? String(data.cashFund) : "");
      setNotes(data.notes ?? "");
      setBrokers(data.brokers);
      setExpenses(data.expenses);
      setExtraLines(data.extraLines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento bozza");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const addVoice = (kind: AddKind, brokerName = "") => {
    if (kind === "broker") {
      setBrokers((prev) => [
        ...prev,
        { broker: brokerName, cashAmount: 0, cardAmount: 0 },
      ]);
    } else if (kind === "expense") {
      setExpenses((prev) => [...prev, { description: "", amount: 0 }]);
    } else {
      setExtraLines((prev) => [...prev, { label: "", amount: 0 }]);
    }
    setAddOpen(false);
  };

  const complete = async () => {
    if (!draft) return;
    setLoading(true);
    setError("");
    setPrintMsg("");
    try {
      const payload = {
        closureDate: draft.closureDate,
        closureTotal: draft.closureTotal,
        cashWithdrawal: parseEuro(cashWithdrawal),
        posTotal: draft.posTotal,
        brokers: brokers
          .filter((b) => b.broker.trim())
          .map((b) => ({
            broker: b.broker.trim(),
            cashAmount: b.cashAmount,
            cardAmount: b.cardAmount,
          })),
        expenses: expenses.filter((e) => e.description.trim() && e.amount > 0),
        cashFund: parseEuro(cashFund),
        extraLines: extraLines.filter((x) => x.label.trim()),
        notes: notes.trim() || undefined,
        operatorId,
        operatorName,
      };
      const result = await edgeApi<{ ok: boolean; record: InternalClosureRecord }>(
        "/api/internal-closure/complete",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setSaved(result.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setLoading(false);
    }
  };

  const printSaved = async () => {
    if (!saved) return;
    setLoading(true);
    setError("");
    try {
      const result = await edgeApi<{ ok: boolean; path: string; text: string }>(
        `/api/internal-closure/history/${saved.id}/print`,
        { method: "POST" },
      );
      setPrintMsg(`Stampato · ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore stampa");
    } finally {
      setLoading(false);
    }
  };

  const previewPayload: InternalClosureDraft | null = draft
    ? {
        ...draft,
        cashWithdrawal: parseEuro(cashWithdrawal),
        cashFund: parseEuro(cashFund),
        brokers: brokers.filter((b) => b.broker.trim()),
        expenses: expenses.filter((e) => e.description.trim()),
        extraLines: extraLines.filter((x) => x.label.trim()),
        notes: notes.trim() || undefined,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[hsl(var(--pg-background))] shadow-xl">
        <header className="shrink-0 border-b border-[hsl(var(--pg-border))] px-5 py-4">
          <h2 className="text-lg font-bold">Chiusura interna</h2>
          <p className="mt-1 text-sm text-[hsl(var(--pg-muted-foreground))]">
            Digitale del taccuino serale (non fiscale). Totale e POS dal sistema; prelievo, broker,
            spese, altre voci e fondo li compili tu. Poi salva / stampa.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {saved ? (
            <div className="space-y-4">
              <p className="text-center text-lg font-bold text-green-600">Chiusura interna salvata</p>
              <pre className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {formatNotebook(saved)}
              </pre>
              <div className="rounded-lg bg-[hsl(var(--pg-muted))]/40 px-4 py-3 text-sm">
                {saved.emailedAt
                  ? `Email inviata il ${new Date(saved.emailedAt).toLocaleString("it-IT")}`
                  : "Email: non configurata (placeholder — email inviata quando attivo)"}
              </div>
              {printMsg && <p className="text-sm text-green-700">{printMsg}</p>}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          ) : !draft ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              {loading ? "Caricamento..." : error || "Nessuna bozza"}
            </p>
          ) : (
            <div className="space-y-1">
              <NotebookRow label="Data" mute>
                <input
                  className="w-full rounded-lg border bg-[hsl(var(--pg-muted))]/30 px-3 py-2 font-mono text-sm"
                  value={draft.closureDate}
                  readOnly
                />
              </NotebookRow>

              <NotebookRow label="Chiusura tot" mute>
                <input
                  className="w-full rounded-lg border bg-[hsl(var(--pg-muted))]/30 px-3 py-2 font-mono text-sm tabular-nums"
                  value={euro(draft.closureTotal)}
                  readOnly
                />
                <p className="mt-1 text-[11px] text-[hsl(var(--pg-muted-foreground))]">
                  Calcolato dagli incassi della giornata
                </p>
              </NotebookRow>

              <NotebookRow label="Prelievo cont">
                <input
                  className="w-full rounded-lg border px-3 py-2 font-mono text-sm tabular-nums"
                  value={cashWithdrawal}
                  onChange={(e) => setCashWithdrawal(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </NotebookRow>

              <NotebookRow label="POS" mute>
                <input
                  className="w-full rounded-lg border bg-[hsl(var(--pg-muted))]/30 px-3 py-2 font-mono text-sm tabular-nums"
                  value={euro(draft.posTotal)}
                  readOnly
                />
              </NotebookRow>

              {brokers.map((b, i) => (
                <NotebookRow key={`b-${i}`} label={b.broker.trim() || "Broker"}>
                  <div className="flex flex-col gap-2">
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Nome (es. Glovo, Alfonsino…)"
                      value={b.broker}
                      onChange={(e) =>
                        setBrokers((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, broker: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <label className="text-xs">
                        Cont €
                        <input
                          className="mt-0.5 w-full rounded-lg border px-2 py-2 font-mono text-sm tabular-nums"
                          placeholder="0"
                          inputMode="decimal"
                          value={b.cashAmount || ""}
                          onChange={(e) =>
                            setBrokers((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, cashAmount: parseEuro(e.target.value) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Carta €
                        <input
                          className="mt-0.5 w-full rounded-lg border px-2 py-2 font-mono text-sm tabular-nums"
                          placeholder="0"
                          inputMode="decimal"
                          value={b.cardAmount || ""}
                          onChange={(e) =>
                            setBrokers((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, cardAmount: parseEuro(e.target.value) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-4 h-9 px-2"
                        aria-label="Rimuovi broker"
                        onClick={() => setBrokers((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                </NotebookRow>
              ))}

              {expenses.map((e, i) => (
                <NotebookRow key={`e-${i}`} label="Spese">
                  <div className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
                    <input
                      className="rounded-lg border px-3 py-2 text-sm"
                      placeholder="Descrizione (es. limoni Conad)"
                      value={e.description}
                      onChange={(ev) =>
                        setExpenses((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, description: ev.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      className="rounded-lg border px-2 py-2 font-mono text-sm tabular-nums"
                      placeholder="€"
                      inputMode="decimal"
                      value={e.amount || ""}
                      onChange={(ev) =>
                        setExpenses((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, amount: parseEuro(ev.target.value) } : row,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 px-2"
                      aria-label="Rimuovi spesa"
                      onClick={() => setExpenses((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </Button>
                  </div>
                </NotebookRow>
              ))}

              {extraLines.map((x, i) => (
                <NotebookRow key={`x-${i}`} label="Altro">
                  <div className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
                    <input
                      className="rounded-lg border px-3 py-2 text-sm"
                      placeholder="Etichetta voce libera"
                      value={x.label}
                      onChange={(ev) =>
                        setExtraLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, label: ev.target.value } : row,
                          ),
                        )
                      }
                    />
                    <input
                      className="rounded-lg border px-2 py-2 font-mono text-sm tabular-nums"
                      placeholder="€"
                      inputMode="decimal"
                      value={x.amount || ""}
                      onChange={(ev) =>
                        setExtraLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, amount: parseEuro(ev.target.value) } : row,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 px-2"
                      aria-label="Rimuovi voce"
                      onClick={() => setExtraLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </Button>
                  </div>
                </NotebookRow>
              ))}

              <div className="relative py-3">
                <Button
                  type="button"
                  variant="default"
                  className="h-11 w-full text-sm font-semibold"
                  onClick={() => setAddOpen((v) => !v)}
                >
                  + Aggiungi voce al taccuino
                </Button>
                {addOpen && (
                  <div className="absolute inset-x-0 top-[calc(100%-0.25rem)] z-10 rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 shadow-lg">
                    <p className="mb-2 text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                      Tipo voce
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => addVoice("broker")}
                      >
                        Broker / delivery
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => addVoice("expense")}
                      >
                        Spesa
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={() => addVoice("extra")}
                      >
                        Altra voce
                      </Button>
                    </div>
                    <p className="mb-1.5 mt-3 text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                      Broker rapidi
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {BROKER_PRESETS.map((name) => {
                        const already = brokers.some(
                          (b) => b.broker.trim().toLowerCase() === name.toLowerCase(),
                        );
                        return (
                          <Button
                            key={name}
                            type="button"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            disabled={already}
                            onClick={() => addVoice("broker", name)}
                          >
                            + {name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <NotebookRow label="Fondo cassa">
                <input
                  className="w-full rounded-lg border px-3 py-2 font-mono text-sm tabular-nums"
                  value={cashFund}
                  onChange={(e) => setCashFund(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </NotebookRow>

              <NotebookRow label="Note">
                <textarea
                  className="min-h-[64px] w-full rounded-lg border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opzionale"
                />
              </NotebookRow>

              {previewPayload && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">
                    Anteprima taccuino
                  </p>
                  <pre className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {formatNotebook(previewPayload)}
                  </pre>
                </div>
              )}

              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-[hsl(var(--pg-border))] px-5 py-3">
          {saved ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => void printSaved()}
              >
                Stampa
              </Button>
              <Button className="flex-1" onClick={onClose}>
                OK
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
                Annulla
              </Button>
              <Button className="flex-1" disabled={loading || !draft} onClick={() => void complete()}>
                {loading ? "Salvataggio..." : "Salva chiusura interna"}
              </Button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
