import { CASH_SERVICE_LABELS, type CashService, type CashSession } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "../lib/api";
import { euro, euroInput } from "../lib/money";
import {
  DenominationCounter,
  cashCountAmount,
  cashCountBreakdown,
  cashCountIsValid,
  emptyCashCount,
} from "./DenominationCounter";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";
import { PinPad } from "./PinPad";

/** Apertura cassa: servizio, fondo iniziale (proposto da quello lasciato) e conferma con PIN. */
export function CashOpenModal({
  suggestedService,
  suggestedOpeningFund,
  usedServicesToday = [],
  onClose,
  onOpened,
}: {
  suggestedService: CashService;
  suggestedOpeningFund: number | null;
  /** Servizi già usati oggi: il pulsante resta visibile ma disattivato. */
  usedServicesToday?: CashService[];
  onClose: () => void;
  onOpened: (session: CashSession) => void;
}) {
  const [step, setStep] = useState<"form" | "pin">("form");
  const [service, setService] = useState<CashService>(suggestedService);
  const [fund, setFund] = useState(emptyCashCount(euroInput(suggestedOpeningFund)));
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const amount = cashCountAmount(fund);
  const fundDifference =
    suggestedOpeningFund != null && Number.isFinite(amount)
      ? Math.round((amount - suggestedOpeningFund) * 100) / 100
      : 0;

  const submit = async (enteredPin: string) => {
    setLoading(true);
    setError("");
    try {
      const session = await edgeApi<CashSession>("/api/cash-sessions/open", {
        method: "POST",
        body: JSON.stringify({
          pin: enteredPin,
          service,
          openingFund: amount,
          openingFundBreakdown: cashCountBreakdown(fund),
        }),
      });
      onOpened(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apertura non riuscita");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OffCanvas widthClass="max-w-md" onClose={loading ? undefined : onClose}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <h2 className="text-lg font-bold">Apri cassa</h2>

        {step === "form" ? (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">Servizio</span>
              <div className="grid grid-cols-2 gap-2">
                {(["LUNCH", "DINNER"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={service === s ? "default" : "outline"}
                    className="h-12"
                    disabled={usedServicesToday.includes(s)}
                    title={usedServicesToday.includes(s) ? "Servizio già chiuso oggi" : undefined}
                    onClick={() => setService(s)}
                  >
                    {CASH_SERVICE_LABELS[s]}
                    {usedServicesToday.includes(s) ? " · chiuso" : ""}
                  </Button>
                ))}
              </div>
            </div>

            <DenominationCounter label="Fondo cassa iniziale" value={fund} onChange={setFund} />

            {suggestedOpeningFund != null && (
              <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                Fondo lasciato alla chiusura precedente: {euro(suggestedOpeningFund)}
              </p>
            )}
            {fundDifference !== 0 && (
              <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-900">
                Il fondo è diverso da quello lasciato alla chiusura precedente (
                {fundDifference > 0 ? "+" : ""}
                {euro(fundDifference)}). Verrà registrato nel log.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">
              {CASH_SERVICE_LABELS[service]} · fondo {euro(amount)}
            </p>
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Conferma con il PIN dell'operatore cassa.
            </p>
            <PinPad
              pin={pin}
              onChange={setPin}
              onComplete={(v) => void submit(v)}
              error={error}
            />
          </>
        )}
        {step === "form" && error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className={offCanvasFooterClass}>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-12 flex-1"
            disabled={loading}
            onClick={step === "pin" ? () => setStep("form") : onClose}
          >
            {step === "pin" ? "Indietro" : "Annulla"}
          </Button>
          {step === "form" && (
            <Button
              className="min-h-12 flex-1"
              disabled={!cashCountIsValid(fund)}
              onClick={() => {
                setError("");
                setStep("pin");
              }}
            >
              Continua
            </Button>
          )}
        </div>
      </div>
    </OffCanvas>
  );
}
