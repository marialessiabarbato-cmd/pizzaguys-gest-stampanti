import { Button } from "@pizzaguys/ui";
import { HeaderMenu, HeaderMenuItem } from "./HeaderMenu";

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function ActionBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1.5 text-[10px] font-bold text-[hsl(var(--pg-primary-foreground))]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function CassaHeader({
  operatorName,
  locationName,
  connected,
  activeShift,
  openTableCount,
  pendingPaymentCount,
  canManage,
  onOpenTables,
  onReservations,
  onDocumentList,
  onClosureHistory,
  onClosureDay,
  onInternalClosure,
  onStartShift,
  onCloseShift,
  onAdmin,
  onProfile,
  onLogout,
}: {
  operatorName: string;
  locationName?: string;
  connected: boolean;
  activeShift: { startedAt: string } | null;
  openTableCount: number;
  pendingPaymentCount: number;
  canManage: boolean;
  onOpenTables: () => void;
  onReservations: () => void;
  onDocumentList: () => void;
  onClosureHistory: () => void;
  onClosureDay: () => void;
  onInternalClosure: () => void;
  onStartShift: () => void;
  onCloseShift: () => void;
  onAdmin: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">Cassa</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              connected ? "bg-green-500/20 text-green-700" : "bg-red-500/20 text-red-700"
            }`}
          >
            {connected ? "Online" : "Offline"}
          </span>
          {activeShift ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Turno attivo · dalle {formatShiftTime(activeShift.startedAt)}
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900">
              Nessun turno
            </span>
          )}
        </div>
        <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
          {operatorName}
          {locationName ? ` · ${locationName}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {canManage && (
          <>
            <Button variant="outline" className="h-9 px-3 text-sm" onClick={onOpenTables}>
              Tavoli
              <ActionBadge count={openTableCount} />
            </Button>
            <Button variant="outline" className="h-9 px-3 text-sm" onClick={onReservations}>
              Prenotazioni
            </Button>
          </>
        )}

        {activeShift ? (
          <Button variant="default" className="h-9 px-3 text-sm" onClick={onCloseShift}>
            Chiudi turno
          </Button>
        ) : (
          <Button variant="default" className="h-9 px-3 text-sm" onClick={onStartShift}>
            Avvia turno
          </Button>
        )}

        {pendingPaymentCount > 0 && (
          <span className="hidden rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 sm:inline">
            {pendingPaymentCount} pagament{pendingPaymentCount === 1 ? "o" : "i"} in attesa
          </span>
        )}

        <div className="mx-1 hidden h-6 w-px bg-[hsl(var(--pg-border))] sm:block" aria-hidden />

        <HeaderMenu label="Account" variant="ghost" align="right">
          <HeaderMenuItem onClick={onProfile}>Profilo</HeaderMenuItem>
          {canManage && (
            <>
              <HeaderMenuItem onClick={onDocumentList}>Lista documenti</HeaderMenuItem>
              <HeaderMenuItem onClick={onClosureHistory}>Storico chiusure</HeaderMenuItem>
            </>
          )}
          <HeaderMenuItem onClick={onAdmin}>Impostazioni</HeaderMenuItem>
          {canManage && (
            <>
              <HeaderMenuItem onClick={onInternalClosure}>Chiusura interna</HeaderMenuItem>
              <HeaderMenuItem onClick={onClosureDay} danger>
                Chiusura giornata
              </HeaderMenuItem>
            </>
          )}
          <HeaderMenuItem onClick={onLogout}>Esci</HeaderMenuItem>
        </HeaderMenu>
      </div>
    </header>
  );
}
