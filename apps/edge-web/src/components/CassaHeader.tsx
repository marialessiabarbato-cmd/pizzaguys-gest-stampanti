import { CASH_SERVICE_LABELS, type CashService } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { HeaderMenu, HeaderMenuItem } from "./HeaderMenu";
import type { CloudStatusView, SyncQueueView } from "../lib/use-cloud-status";

function sinceLabel(iso: string | null): string {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `da ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `da ${h} ${h === 1 ? "ora" : "ore"}` : `da ${Math.round(h / 24)} giorni`;
}

/** Indicatore Cloud: verde se ok, poi giallo/arancio/rosso secondo da quanto non risponde. */
function CloudBadge({ cloud, syncQueue }: { cloud?: CloudStatusView | null; syncQueue?: SyncQueueView | null }) {
  if (!cloud || cloud.state === "UNKNOWN") return null;
  const pending = syncQueue?.pending ?? 0;
  if (cloud.level === "ok") {
    return (
      <span
        className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700"
        title={pending > 0 ? `${pending} invii in coda verso il Cloud` : "Cloud collegato"}
      >
        Cloud ok{pending > 0 ? ` · ${pending} in coda` : ""}
      </span>
    );
  }
  const tone =
    cloud.level === "critical"
      ? "bg-red-500/20 text-red-700"
      : cloud.level === "warning"
        ? "bg-orange-500/20 text-orange-800"
        : "bg-amber-500/15 text-amber-900";
  const label = cloud.state === "UNAUTHORIZED" ? "Cloud: token rifiutato" : `Cloud non raggiungibile ${sinceLabel(cloud.failingSince)}`;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`} title={cloud.message ?? undefined}>
      {label}
      {pending > 0 ? ` · ${pending} in coda` : ""}
    </span>
  );
}

function formatShiftTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function ActionBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--pg-primary))] px-1.5 text-2xs font-bold text-[hsl(var(--pg-primary-foreground))]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function CassaHeader({
  operatorName,
  locationName,
  connected,
  connectionDetail,
  cloud,
  syncQueue,
  cashSession,
  canOperateCash,
  openTableCount,
  pendingPaymentCount,
  canManage,
  onOpenTables,
  onReservations,
  onDocumentList,
  onClosureHistory,
  onClosureDay,
  onInternalClosure,
  onOpenCash,
  onCloseCash,
  onCashMovements,
  onOperatorShifts,
  onAdmin,
  onProfile,
  onLogout,
}: {
  operatorName: string;
  locationName?: string;
  connected: boolean;
  /** Dettaglio quando scollegata (es. "riprovo tra 5 s") */
  connectionDetail?: string;
  cloud?: CloudStatusView | null;
  syncQueue?: SyncQueueView | null;
  /** Sessione di cassa aperta (null = cassa chiusa, undefined = stato non ancora noto). */
  cashSession: { service: CashService; openedAt: string; openedByName: string } | null | undefined;
  /** Operatore cassa (Cassiere o Admin): può aprire, movimentare e chiudere la cassa. */
  canOperateCash: boolean;
  openTableCount: number;
  pendingPaymentCount: number;
  canManage: boolean;
  onOpenTables: () => void;
  onReservations: () => void;
  onDocumentList: () => void;
  onClosureHistory: () => void;
  onClosureDay: () => void;
  onInternalClosure: () => void;
  onOpenCash: () => void;
  onCloseCash: () => void;
  onCashMovements: () => void;
  onOperatorShifts: () => void;
  /** Impostazioni (sala, stampanti, routing, staff): solo per l'Admin di sede. */
  onAdmin?: () => void;
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
            {connected ? "Online" : `Offline${connectionDetail ? ` · ${connectionDetail}` : ""}`}
          </span>
          <CloudBadge cloud={cloud} syncQueue={syncQueue} />
          {cashSession ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Cassa aperta · {CASH_SERVICE_LABELS[cashSession.service]} · dalle{" "}
              {formatShiftTime(cashSession.openedAt)} · {cashSession.openedByName}
            </span>
          ) : cashSession === null ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900">
              Cassa chiusa
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
          {operatorName}
          {locationName ? ` · ${locationName}` : ""}
        </p>
        {cloud && (cloud.level === "warning" || cloud.level === "critical") && cloud.message && (
          <p className={`mt-0.5 max-w-3xl text-xs ${cloud.level === "critical" ? "text-red-700" : "text-orange-800"}`}>
            {cloud.state === "UNAUTHORIZED"
              ? cloud.message
              : `${cloud.message} — Il servizio continua normalmente; menu e report si aggiorneranno quando il Cloud torna raggiungibile.${
                  cloud.level === "critical" ? " Controlla il router e la linea internet." : ""
                }`}
          </p>
        )}
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

        {canOperateCash && cashSession && (
          <>
            <Button variant="outline" className="h-9 px-3 text-sm" onClick={onCashMovements}>
              Prelievi
            </Button>
            <Button variant="default" className="h-9 px-3 text-sm" onClick={onCloseCash}>
              Chiudi cassa
            </Button>
          </>
        )}
        {canOperateCash && cashSession === null && (
          <Button variant="default" className="h-9 px-3 text-sm" onClick={onOpenCash}>
            Apri cassa
          </Button>
        )}

        {pendingPaymentCount > 0 && (
          <span className="hidden rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 sm:inline">
            {pendingPaymentCount} pagament{pendingPaymentCount === 1 ? "o" : "i"} in attesa
          </span>
        )}

        <div className="mx-1 hidden h-6 w-px bg-[hsl(var(--pg-border))] sm:block" aria-hidden />

        {canManage && (
          <Button variant="outline" className="h-9 px-3 text-sm" onClick={onInternalClosure}>
            Chiusura interna
          </Button>
        )}

        <HeaderMenu label="Account" variant="ghost" align="right">
          <HeaderMenuItem onClick={onProfile}>Profilo</HeaderMenuItem>
          <HeaderMenuItem onClick={onOperatorShifts}>Operatori in turno</HeaderMenuItem>
          {canManage && (
            <>
              <HeaderMenuItem onClick={onDocumentList}>Lista documenti</HeaderMenuItem>
              <HeaderMenuItem onClick={onClosureHistory}>Storico chiusure</HeaderMenuItem>
            </>
          )}
          {onAdmin && <HeaderMenuItem onClick={onAdmin}>Impostazioni</HeaderMenuItem>}
          {canManage && (
            <HeaderMenuItem onClick={onClosureDay} danger>
              Chiusura giornata
            </HeaderMenuItem>
          )}
          <HeaderMenuItem onClick={onLogout}>Esci</HeaderMenuItem>
        </HeaderMenu>
      </div>
    </header>
  );
}
