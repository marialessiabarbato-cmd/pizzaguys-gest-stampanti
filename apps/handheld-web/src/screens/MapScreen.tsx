import type { TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { ConfirmModal } from "../components/ConfirmModal";
import { GuestsModal, type GuestsConfirmPayload } from "../components/GuestsModal";
import { MapUnionLines } from "../components/MapUnionLines";
import { TableUnionChips } from "../components/TableUnionChips";
import {
  hostTableLabel,
  isMergedAway,
  isUnionHost,
  mergedTableLabel,
  seatSummary,
  unionLinks,
} from "../lib/table-display";
import type { LiveTable, Operator } from "../lib/types";

const STATUS_COLORS: Record<TableStatus, string> = {
  FREE: "bg-emerald-600",
  OCCUPIED: "bg-blue-600",
  LOCKED: "bg-rose-600",
  BILL_REQUESTED: "bg-amber-500 animate-pulse",
  SPLIT_IN_PROGRESS: "bg-violet-600",
};

export function MapScreen({
  operator,
  tables,
  message,
  isOffline,
  lockPending,
  logoutConfirm,
  pendingGuestsTable,
  guestsModalLoading,
  guestsModalError,
  onSelectTable,
  onLogout,
  onConfirmLogout,
  onCancelLogout,
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
  guestsModalLoading: boolean;
  guestsModalError: string;
  onSelectTable: (t: LiveTable) => void;
  onLogout: () => void;
  onConfirmLogout: () => void;
  onCancelLogout: () => void;
  onConfirmGuests: (payload: GuestsConfirmPayload) => void;
  onCancelGuests: () => void;
}) {
  const links = unionLinks(tables);
  const hasUnions = links.length > 0;

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

      <div className="relative mx-auto h-[480px] max-w-3xl overflow-hidden rounded-xl border-2 border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30">
        <MapUnionLines links={links} />

        {tables.map((t) => {
          const hostLabel = hostTableLabel(t, tables);
          const mergedAway = isMergedAway(t);
          const unionHost = isUnionHost(t);
          const displayLabel = unionHost ? mergedTableLabel(t, tables) : t.label;
          const seats = seatSummary(t);

          return (
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
                zIndex: unionHost ? 20 : mergedAway ? 5 : 10,
              }}
              className={`relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl px-1 py-1.5 text-white shadow-lg transition active:scale-[0.97] ${
                mergedAway
                  ? "border-2 border-dashed border-amber-300/90 bg-slate-600/75"
                  : unionHost
                    ? `border-[3px] border-amber-300 shadow-amber-400/40 ${STATUS_COLORS[t.status] ?? "bg-gray-500"} ring-2 ring-amber-200/50`
                    : `${STATUS_COLORS[t.status] ?? "bg-gray-500"} border-2 border-white/20`
              } ${lockPending === t.id ? "opacity-50" : ""}`}
            >
              {unionHost && (
                <span className="absolute left-0 right-0 top-0 bg-amber-400 px-1 py-0.5 text-center text-[8px] font-extrabold uppercase tracking-wider text-amber-950">
                  ⊕ Gruppo unito
                </span>
              )}

              {mergedAway && (
                <span className="absolute left-0 right-0 top-0 bg-amber-500/90 px-1 py-0.5 text-center text-[8px] font-bold text-amber-950">
                  Annesso
                </span>
              )}

              <span
                className={`font-bold leading-tight ${unionHost || mergedAway ? "mt-3 text-base" : "text-lg"}`}
              >
                {displayLabel}
              </span>

              {unionHost && (
                <TableUnionChips host={t} allTables={tables} size="sm" />
              )}

              {mergedAway && hostLabel && (
                <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold">
                  → conto su {hostLabel}
                </span>
              )}

              {seats && !mergedAway && (
                <span className="text-[10px] font-medium opacity-95">{seats}</span>
              )}

              {t.lockedByName && t.status === "LOCKED" && !mergedAway && (
                <span className="text-[10px] opacity-90">{t.lockedByName}</span>
              )}

              {(t.status === "OCCUPIED" || t.status === "BILL_REQUESTED") && !mergedAway && (
                <span className="text-[9px] opacity-80">tap → gestione</span>
              )}
            </button>
          );
        })}

        {tables.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun tavolo — configura la sala su Main Station
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded ${color.split(" ")[0]}`} />
              {status}
            </span>
          ))}
        </div>
        {hasUnions && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-400 text-[10px] font-bold">
                ⊕
              </span>
              Tavolo principale (conto)
            </span>
            <span className="text-amber-700">—</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-amber-500 bg-slate-400/60" />
              Tavolo annesso (linea gialla → principale)
            </span>
          </div>
        )}
      </div>

      {pendingGuestsTable && (
        <GuestsModal
          key={pendingGuestsTable.id}
          primaryTable={pendingGuestsTable}
          tables={tables}
          loading={guestsModalLoading}
          error={guestsModalError}
          onConfirm={onConfirmGuests}
          onCancel={onCancelGuests}
        />
      )}
    </main>
  );
}
