import {
  CASH_SERVICE_LABELS,
  type CashMovement,
  type CashSession,
  type CashSessionSummary,
} from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
import { discrepancyClass, discrepancyLabel, euro, euroInput, parseEuro } from "../lib/money";
import { CashMovementList } from "./CashMovementList";
import {
  DenominationCounter,
  cashCountAmount,
  cashCountBreakdown,
  cashCountIsValid,
  emptyCashCount,
} from "./DenominationCounter";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";
import { PinPad } from "./PinPad";

type Step = "verify" | "movements" | "cash" | "pos" | "summary" | "pin" | "done";

const STEP_TITLES: Record<Step, string> = {
  verify: "Verifica",
  movements: "Prelievi e spese",
  cash: "Conteggio contanti",
  pos: "POS",
  summary: "Riepilogo",
  pin: "Conferma",
  done: "Cassa chiusa",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Contanti",
  POS: "Carte / POS",
  MEAL_VOUCHER: "Buoni pasto",
  SATISPAY: "Satispay",
  OTHER: "Altro",
};

interface CloseResult {
  session: CashSession;
  movements: CashMovement[];
  reportPath: string;
  printMessages: string[];
  synced: boolean;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Chiusura guidata della sessione di cassa (pranzo o cena) da parte dell'operatore cassa. */
export function CashCloseWizard({
  sessionId,
  onClose,
  onClosed,
}: {
  sessionId: string;
  onClose: () => void;
  onClosed: (session: CashSession) => void;
}) {
  const [step, setStep] = useState<Step>("verify");
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [cash, setCash] = useState(emptyCashCount());
  const [pos, setPos] = useState("");
  const [fundLeft, setFundLeft] = useState("");
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CloseResult | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await edgeApi<CashSessionSummary>(`/api/cash-sessions/${sessionId}/summary`);
      setSummary(data);
      setFundLeft((current) => current || euroInput(data.session.openingFund));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = summary?.theoretical;
  const counted = cashCountAmount(cash);
  const posDeclared = parseEuro(pos);
  const fundLeftValue = parseEuro(fundLeft);
  const discrepancyCash = t && Number.isFinite(counted) ? round2(counted - t.expectedCash) : 0;
  const discrepancyPos = t && Number.isFinite(posDeclared) ? round2(posDeclared - t.posSales) : 0;
  const threshold = summary?.discrepancyNoteThreshold ?? 5;
  const noteRequired = Math.abs(discrepancyCash) > threshold || Math.abs(discrepancyPos) > threshold;
  const fundLeftInvalid =
    !Number.isFinite(fundLeftValue) || fundLeftValue < 0 || fundLeftValue > counted + 0.001;
  const summaryValid = !fundLeftInvalid && (!noteRequired || notes.trim().length > 0);

  const submit = async (enteredPin: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await edgeApi<CloseResult>(`/api/cash-sessions/${sessionId}/close`, {
        method: "POST",
        body: JSON.stringify({
          pin: enteredPin,
          countedCash: counted,
          countedCashBreakdown: cashCountBreakdown(cash),
          posDeclared,
          closingFundLeft: fundLeftValue,
          notes: notes.trim() || undefined,
        }),
      });
      setResult(data);
      setStep("done");
      onClosed(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chiusura non riuscita");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const next: Partial<Record<Step, { to: Step; disabled?: boolean; label?: string }>> = {
    verify: { to: "movements", disabled: !summary?.canClose },
    movements: { to: "cash" },
    cash: { to: "pos", disabled: !cashCountIsValid(cash) },
    pos: { to: "summary", disabled: !Number.isFinite(posDeclared) || posDeclared < 0 },
    summary: { to: "pin", disabled: !summaryValid, label: "Conferma chiusura" },
  };
  const back: Partial<Record<Step, Step>> = {
    movements: "verify",
    cash: "movements",
    pos: "cash",
    summary: "pos",
    pin: "summary",
  };

  const serviceLabel = summary ? CASH_SERVICE_LABELS[summary.session.service] : "";

  return (
    <OffCanvas widthClass="max-w-lg" onClose={loading || step === "done" ? undefined : onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <h2 className="text-lg font-bold">Chiudi cassa {serviceLabel.toLowerCase()}</h2>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{STEP_TITLES[step]}</p>
        </div>

        {!summary && !error && <p className="text-sm">Caricamento…</p>}

        {summary && t && step === "verify" && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1 rounded-lg border border-[hsl(var(--pg-border))] p-3">
              <Row
                label="Aperta"
                value={`${new Date(summary.session.openedAt).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })} · ${summary.session.openedByName}`}
              />
              <Row label="Documenti emessi" value={String(t.documentCount)} />
              {Object.entries(t.byPaymentMethod).map(([method, amount]) => (
                <Row key={method} label={METHOD_LABELS[method] ?? method} value={euro(amount)} />
              ))}
              <Row label="Totale incassato" value={euro(t.totalSales)} strong />
            </div>
            {summary.pendingPayments.length > 0 && (
              <div className="rounded-lg bg-red-500/10 p-3 text-red-700">
                <p className="font-medium">Conti in attesa di pagamento</p>
                <p className="mt-1 text-xs">
                  Incassa o rifiuta prima di chiudere:{" "}
                  {summary.pendingPayments.map((p) => `${p.tableLabel} (${euro(p.total)})`).join(", ")}
                </p>
              </div>
            )}
            {summary.openTables.length > 0 && (
              <p className="rounded-lg bg-amber-500/15 p-3 text-amber-900">
                {summary.openTables.length} tavolo/i ancora aperti: restano aperti e verranno
                incassati nella prossima sessione.
              </p>
            )}
          </div>
        )}

        {summary && step === "movements" && (
          <CashMovementList
            sessionId={sessionId}
            movements={summary.movements}
            onChanged={() => void load()}
          />
        )}

        {step === "cash" && (
          <DenominationCounter label="Contanti contati nel cassetto" value={cash} onChange={setCash} />
        )}

        {step === "pos" && (
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Totale della strisciata di chiusura POS</span>
            <input
              inputMode="decimal"
              className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-3 text-lg tabular-nums"
              placeholder="0,00"
              value={pos}
              onChange={(e) => setPos(e.target.value)}
            />
          </label>
        )}

        {summary && t && step === "summary" && (
          <div className="space-y-3 text-sm">
            <div className="space-y-1 rounded-lg border border-[hsl(var(--pg-border))] p-3">
              <Row label="Fondo iniziale" value={euro(t.openingFund)} />
              <Row label="Incassi in contanti" value={euro(t.cashSales)} />
              {t.deposits > 0 && <Row label="Versamenti" value={euro(t.deposits)} />}
              {t.withdrawals > 0 && <Row label="Prelievi" value={euro(-t.withdrawals)} />}
              {t.expenses > 0 && <Row label="Spese" value={euro(-t.expenses)} />}
              <Row label="Contanti attesi" value={euro(t.expectedCash)} strong />
              <Row label="Contanti contati" value={euro(counted)} strong />
            </div>
            <div className={`rounded-lg p-3 text-center font-bold ${discrepancyClass(discrepancyCash)}`}>
              Contanti: {discrepancyLabel(discrepancyCash)} {euro(discrepancyCash)}
            </div>

            <div className="space-y-1 rounded-lg border border-[hsl(var(--pg-border))] p-3">
              <Row label="POS teorico" value={euro(t.posSales)} />
              <Row label="POS dichiarato" value={euro(posDeclared)} />
            </div>
            <div className={`rounded-lg p-3 text-center font-bold ${discrepancyClass(discrepancyPos)}`}>
              POS: {discrepancyLabel(discrepancyPos)} {euro(discrepancyPos)}
            </div>

            <label className="block space-y-1">
              <span className="font-medium">Fondo lasciato in cassa per il prossimo servizio</span>
              <input
                inputMode="decimal"
                className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2.5 text-base tabular-nums"
                value={fundLeft}
                onChange={(e) => setFundLeft(e.target.value)}
              />
              {fundLeftInvalid && (
                <span className="text-xs text-red-600">
                  Il fondo lasciato non può superare i contanti contati.
                </span>
              )}
              {!fundLeftInvalid && (
                <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Da versare / portare via: {euro(round2(counted - fundLeftValue))}
                </span>
              )}
            </label>

            <label className="block space-y-1">
              <span className="font-medium">
                Nota {noteRequired ? `(obbligatoria: scostamento oltre ${euro(threshold)})` : "(facoltativa)"}
              </span>
              <textarea
                className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === "pin" && (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Conferma con il PIN dell'operatore cassa. Dopo la chiusura comande e incassi sono
              bloccati fino alla prossima apertura.
            </p>
            <PinPad pin={pin} onChange={setPin} onComplete={(v) => void submit(v)} error={error} />
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 text-sm">
            <p className="text-center text-lg font-bold text-green-600">
              Cassa {CASH_SERVICE_LABELS[result.session.service].toLowerCase()} chiusa
            </p>
            <div className={`rounded-lg p-3 text-center font-bold ${discrepancyClass(result.session.discrepancyCash ?? 0)}`}>
              Contanti: {euro(result.session.discrepancyCash ?? 0)} · POS:{" "}
              {euro(result.session.discrepancyPos ?? 0)}
            </div>
            {result.printMessages.length > 0 ? (
              <div className="rounded-lg bg-red-500/10 p-3 text-red-700">
                {result.printMessages.map((m) => (
                  <p key={m}>{m}</p>
                ))}
              </div>
            ) : (
              <p className="text-center">Report stampato sulla stampante Bar.</p>
            )}
            <p className="text-center text-xs text-[hsl(var(--pg-muted-foreground))]">
              {result.synced
                ? "Inviato al Cloud."
                : "Invio al Cloud in coda: verrà ritentato automaticamente."}
            </p>
          </div>
        )}

        {error && step !== "pin" && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className={offCanvasFooterClass}>
        {step === "done" ? (
          <Button className="min-h-12 w-full" onClick={onClose}>
            OK
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-12 flex-1"
              disabled={loading}
              onClick={() => {
                setError("");
                const previous = back[step];
                if (previous) setStep(previous);
                else onClose();
              }}
            >
              {back[step] ? "Indietro" : "Annulla"}
            </Button>
            {next[step] && (
              <Button
                className="min-h-12 flex-1"
                disabled={next[step]!.disabled}
                onClick={() => {
                  setError("");
                  setStep(next[step]!.to);
                }}
              >
                {next[step]!.label ?? "Avanti"}
              </Button>
            )}
          </div>
        )}
      </div>
    </OffCanvas>
  );
}
