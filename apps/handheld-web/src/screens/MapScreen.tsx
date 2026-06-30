import type { TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { ConfirmModal } from "../components/ConfirmModal";
import { GuestsModal } from "../components/GuestsModal";
import type { LiveTable, Operator } from "../lib/types";

const STATUS_COLORS: Record<TableStatus, string> = {
  FREE: "bg-green-500",
  OCCUPIED: "bg-blue-500",
  LOCKED: "bg-red-500",
  BILL_REQUESTED: "bg-yellow-500 animate-pulse",
  SPLIT_IN_PROGRESS: "bg-purple-500",
};

export function MapScreen({
  operator,
  tables,
  message,
  isOffline,
  lockPending,
  logoutConfirm,
  pendingGuestsTable,
  guestCount,
  onSelectTable,
  onLogout,
  onConfirmLogout,
  onCancelLogout,
  onGuestsChange,
  onConfirmGuests,
  onCancelGuests,
}: {
  operator: Operator;
  tables: LiveTable[];
  message: string;
  isOffline: boolean;
  lockPending: string | null;
  logoutConfirm: boolean;
  pendingGuestsTable: LiveTable | null;
  guestCount: number;
  onSelectTable: (t: LiveTable) => void;
  onLogout: () => void;
  onConfirmLogout: () => void;
  onCancelLogout: () => void;
  onGuestsChange: (n: number) => void;
  onConfirmGuests: () => void;
  onCancelGuests: () => void;
}) {
  return (
    <main className="min-h-screen p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mappa sala</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {operator.firstName} {operator.lastName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs ${!isOffline ? "bg-green-500/20 text-green-600" : "bg-yellow-500/20"}`}
          >
            {!isOffline ? "Online" : "Offline"}
          </span>
          <Button variant="outline" className="min-h-12" onClick={onLogout}>
            Esci
          </Button>
        </div>
      </header>

      {message && (
        <p className="mb-3 rounded bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
      )}

      {logoutConfirm && (
        <ConfirmModal
          title="Uscire dalla sessione?"
          message="Dovrai reinserire il PIN per accedere."
          confirmLabel="Esci"
          onConfirm={onConfirmLogout}
          onCancel={onCancelLogout}
        />
      )}

      <div className="relative mx-auto h-[480px] max-w-3xl rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20">
        {tables.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={lockPending === t.id}
            onClick={() => onSelectTable(t)}
            style={{
              position: "absolute",
              left: t.x,
              top: t.y,
              width: t.width,
              height: t.height,
            }}
            className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg text-white shadow-md transition active:scale-95 ${STATUS_COLORS[t.status] ?? "bg-gray-400"} ${lockPending === t.id ? "opacity-50" : ""}`}
          >
            <span className="text-lg font-bold">{t.label}</span>
            {(t.guests ?? (!t.isVirtual ? t.defaultGuests : undefined)) && (
              <span className="text-[10px]">{t.guests ?? t.defaultGuests} coperti</span>
            )}
            {t.lockedByName && t.status === "LOCKED" && (
              <span className="text-[10px]">{t.lockedByName}</span>
            )}
            {(t.status === "OCCUPIED" || t.status === "BILL_REQUESTED") && (
              <span className="text-[9px] opacity-90">tap → gestione</span>
            )}
          </button>
        ))}
        {tables.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun tavolo — configura la sala su Main Station
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${color.split(" ")[0]}`} />
            {status}
          </span>
        ))}
      </div>

      {pendingGuestsTable && (
        <GuestsModal
          tableLabel={pendingGuestsTable.label}
          guests={guestCount}
          onChange={onGuestsChange}
          onConfirm={onConfirmGuests}
          onCancel={onCancelGuests}
        />
      )}
    </main>
  );
}
