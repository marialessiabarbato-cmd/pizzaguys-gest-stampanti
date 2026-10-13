import type { CashSessionSummary } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
import { euro } from "../lib/money";
import { CashMovementList } from "./CashMovementList";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

/** Prelievi, spese e versamenti durante il servizio (D2). */
export function CashMovementModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSummary(await edgeApi<CashSessionSummary>(`/api/cash-sessions/${sessionId}/summary`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OffCanvas widthClass="max-w-md" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <h2 className="text-lg font-bold">Prelievi e spese</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {summary && (
          <>
            <p className="rounded-lg bg-[hsl(var(--pg-muted))]/40 p-3 text-sm">
              Contanti attesi in cassa ora:{" "}
              <strong className="tabular-nums">{euro(summary.theoretical.expectedCash)}</strong>
            </p>
            <CashMovementList
              sessionId={sessionId}
              movements={summary.movements}
              onChanged={() => void load()}
            />
          </>
        )}
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 w-full" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    </OffCanvas>
  );
}
