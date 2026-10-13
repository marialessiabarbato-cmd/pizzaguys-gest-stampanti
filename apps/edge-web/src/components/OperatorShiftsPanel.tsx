import { isCashOperatorRole } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { edgeApi } from "../lib/api";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

interface OperatorShift {
  id: string;
  staffId: string;
  staffName: string;
  role: string;
  startedAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  USER_ADMIN: "Admin",
  CASHIER: "Cassiere",
  WAITER: "Cameriere",
};

/** Operatori in turno (presenze). L'operatore cassa può chiudere il turno di chiunque. */
export function OperatorShiftsPanel({
  operator,
  onClose,
}: {
  operator: { id: string; role: string };
  onClose: () => void;
}) {
  const [shifts, setShifts] = useState<OperatorShift[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setShifts(await edgeApi<OperatorShift[]>("/api/shifts"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const end = async (shift: OperatorShift) => {
    setError("");
    try {
      await edgeApi(`/api/shifts/${shift.id}/end`, {
        method: "POST",
        body: JSON.stringify({ requestedByStaffId: operator.id }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore chiusura turno");
    }
  };

  const canEndOthers = isCashOperatorRole(operator.role);

  return (
    <OffCanvas widthClass="max-w-md" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <h2 className="text-lg font-bold">Operatori in turno</h2>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Il turno parte all'accesso con PIN. Non sblocca il locale: quello dipende dall'apertura
            della cassa.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {shifts.length === 0 ? (
          <p className="text-sm">Nessun operatore in turno.</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--pg-border))] rounded-lg border border-[hsl(var(--pg-border))] text-sm">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div>
                  <p className="font-medium">{s.staffName}</p>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {ROLE_LABELS[s.role] ?? s.role} · dalle{" "}
                    {new Date(s.startedAt).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {(canEndOthers || s.staffId === operator.id) && (
                  <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => void end(s)}>
                    Fine turno
                  </Button>
                )}
              </li>
            ))}
          </ul>
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
