import { CASH_MOVEMENT_LABELS, type CashMovement, type CashMovementType } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "../lib/api";
import { euro, parseEuro } from "../lib/money";
import { PinPad } from "./PinPad";

const TYPES: CashMovementType[] = ["WITHDRAWAL", "EXPENSE", "DEPOSIT"];

/**
 * Elenco e inserimento di prelievi, spese e versamenti della sessione aperta.
 * Ogni modifica è confermata con il PIN dell'operatore cassa.
 */
export function CashMovementList({
  sessionId,
  movements,
  onChanged,
}: {
  sessionId: string;
  movements: CashMovement[];
  onChanged: () => void;
}) {
  const [type, setType] = useState<CashMovementType>("WITHDRAWAL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<
    { kind: "add" } | { kind: "delete"; movement: CashMovement } | null
  >(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const parsedAmount = parseEuro(amount);
  const canAdd = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const confirm = async (enteredPin: string) => {
    if (!pending) return;
    setError("");
    try {
      if (pending.kind === "add") {
        await edgeApi(`/api/cash-sessions/${sessionId}/movements`, {
          method: "POST",
          body: JSON.stringify({
            pin: enteredPin,
            type,
            amount: parsedAmount,
            reason: reason.trim() || undefined,
          }),
        });
        setAmount("");
        setReason("");
      } else {
        await edgeApi(`/api/cash-sessions/${sessionId}/movements/${pending.movement.id}`, {
          method: "DELETE",
          body: JSON.stringify({ pin: enteredPin }),
        });
      }
      setPending(null);
      setPin("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione non riuscita");
      setPin("");
    }
  };

  if (pending) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          {pending.kind === "add"
            ? `${CASH_MOVEMENT_LABELS[type]} di ${euro(parsedAmount)}`
            : `Elimina ${CASH_MOVEMENT_LABELS[pending.movement.type].toLowerCase()} di ${euro(pending.movement.amount)}`}{" "}
          — conferma con il PIN dell'operatore cassa.
        </p>
        <PinPad pin={pin} onChange={setPin} onComplete={(v) => void confirm(v)} error={error} />
        <Button
          variant="ghost"
          className="min-h-11 w-full"
          onClick={() => {
            setPending(null);
            setPin("");
            setError("");
          }}
        >
          Annulla
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {movements.length === 0 ? (
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Nessun prelievo, spesa o versamento registrato.
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--pg-border))] rounded-lg border border-[hsl(var(--pg-border))] text-sm">
          {movements.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {CASH_MOVEMENT_LABELS[m.type]}
                  {m.reason ? ` · ${m.reason}` : ""}
                </p>
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  {new Date(m.createdAt).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {m.staffName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">
                  {m.type === "DEPOSIT" ? "+" : "−"}
                  {euro(m.amount)}
                </span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
                  onClick={() => setPending({ kind: "delete", movement: m })}
                >
                  Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-[hsl(var(--pg-border))] p-3">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <Button
              key={t}
              variant={type === t ? "default" : "outline"}
              className="h-10 text-sm"
              onClick={() => setType(t)}
            >
              {CASH_MOVEMENT_LABELS[t]}
            </Button>
          ))}
        </div>
        <input
          inputMode="decimal"
          className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2.5 text-base tabular-nums"
          placeholder="Importo (€)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2.5 text-sm"
          placeholder={type === "EXPENSE" ? "Descrizione (es. ghiaccio, fornitore)" : "Motivo (facoltativo)"}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button className="min-h-11 w-full" disabled={!canAdd} onClick={() => setPending({ kind: "add" })}>
          Registra {CASH_MOVEMENT_LABELS[type].toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
