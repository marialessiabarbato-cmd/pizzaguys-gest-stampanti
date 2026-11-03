import type { TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@pizzaguys/comanda";
import { GuestsModal, type GuestsConfirmPayload } from "../components/GuestsModal";
import { RoomTabs } from "../components/RoomTabs";
import { CashClosedBanner } from "@pizzaguys/comanda";
import { TableList, TableReorderList } from "../components/TableListView";
import { TableMapViewport } from "../components/TableMapViewport";
import {
  TABLE_STATUS_COLORS,
  TABLE_STATUS_DOT,
  TABLE_STATUS_LABELS,
  filterMapVisibleTables,
  filterTablesByRoom,
  isUnionHost,
  mapTableMeta,
  sortTablesSequential,
  tableLabelFontClass,
} from "@pizzaguys/comanda";
import type { LiveTable, Operator } from "../lib/types";

/** Larghezza indicativa di una tessera in griglia, per scegliere il corpo dell'etichetta. */
const GRID_LABEL_WIDTH = 96;

type TablesView = "map" | "list";
const VIEW_STORAGE_KEY = "pg-handheld-tables-view";

/** Vista scelta su questo dispositivo (mappa o lista): solo comodità, può mancare. */
function readStoredView(): TablesView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "map";
  } catch {
    return "map";
  }
}

function storeView(view: TablesView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* storage non disponibile (navigazione privata): resta la scelta in memoria */
  }
}

export function MapScreen({
  operator,
  tables,
  rooms,
  message,
  isOffline,
  cashClosed,
  lockPending,
  logoutConfirm,
  onEndShift,
  pendingGuestsTable,
  guestsModalLoading,
  guestsModalError,
  onSelectTable,
  onSaveTableOrder,
  onOpenCounter,
  onLogout,
  onConfirmLogout,
  onCancelLogout,
  onConfirmGuests,
  onCancelGuests,
}: {
  operator: Operator;
  tables: LiveTable[];
  rooms: Array<{ id: string; name: string }>;
  message: string;
  isOffline: boolean;
  cashClosed: boolean;
  lockPending: string | null;
  logoutConfirm: boolean;
  onEndShift: () => void;
  pendingGuestsTable: LiveTable | null;
  guestsModalLoading: boolean;
  guestsModalError: string;
  onSelectTable: (t: LiveTable) => void;
  /** Salva il nuovo ordine dei tavoli della sala (riservato all'Admin di sede). */
  onSaveTableOrder: (roomId: string | null, tableIds: string[]) => Promise<void>;
  onOpenCounter?: () => void;
  onLogout: () => void;
  onConfirmLogout: () => void;
  onCancelLogout: () => void;
  onConfirmGuests: (payload: GuestsConfirmPayload) => void;
  onCancelGuests: () => void;
}) {
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [view, setView] = useState<TablesView>(readStoredView);
  const [reordering, setReordering] = useState(false);
  const canReorder = operator.role === "USER_ADMIN";

  const changeView = (next: TablesView) => {
    setView(next);
    storeView(next);
    if (next === "map") setReordering(false);
  };

  useEffect(() => {
    if (rooms.length === 0) {
      setSelectedRoomId("");
      return;
    }
    setSelectedRoomId((current) => {
      if (current && rooms.some((room) => room.id === current)) return current;
      const internalRoom = rooms.find((room) => room.name.trim().toLowerCase().includes("interna"));
      return internalRoom?.id ?? rooms[0]?.id ?? "";
    });
  }, [rooms]);

  const salaTables = useMemo(
    () => filterTablesByRoom(tables, selectedRoomId || null, rooms.length),
    [tables, selectedRoomId, rooms.length],
  );

  const visibleTables = useMemo(
    () => filterMapVisibleTables(salaTables),
    [salaTables],
  );

  const displayTables = useMemo(() => {
    const internalRoom = rooms.find((room) => room.name.trim().toLowerCase().includes("interna"));
    const internalMinX = tables
      .filter((t) => !t.isVirtual && internalRoom && t.roomId === internalRoom.id)
      .reduce<number | null>((min, t) => (min == null ? t.x : Math.min(min, t.x)), null);
    const baseX = internalMinX ?? visibleTables.reduce<number | null>(
      (min, t) => (min == null ? t.x : Math.min(min, t.x)),
      null,
    );
    if (baseX == null) return visibleTables;
    return visibleTables.map((t) => ({ ...t, x: t.x - baseX }));
  }, [rooms, visibleTables, tables]);

  const activeRoomName = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId)?.name,
    [rooms, selectedRoomId],
  );

  // Griglia (telefono) e lista: ordine sequenziale (personalizzato, poi naturale per nome).
  const gridTables = useMemo(() => sortTablesSequential(displayTables), [displayTables]);

  // Riordino: tutti i tavoli fisici della sala, compresi gli annessi nascosti in mappa,
  // perché l'Edge salva l'ordine dell'intera sala.
  const orderRoomId = selectedRoomId || null;
  const reorderTables = useMemo(
    () => tables.filter((t) => !t.isVirtual && (t.roomId ?? null) === orderRoomId),
    [tables, orderRoomId],
  );

  const emptyMessage = (
    <p className="px-6 py-10 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
      {activeRoomName ? `Nessun tavolo in ${activeRoomName}` : "Nessun tavolo in sala — configura la mappa da Admin"}
    </p>
  );

  const renderTable = (table: LiveTable, layout: "map" | "grid", labelWidth: number) => {
    const unionHost = isUnionHost(table);
    const annexedCount = table.linkedTableIds?.length ?? 0;
    const { title, meta } = mapTableMeta(table, tables);
    const status = table.status;

    return (
      <button
        key={table.id}
        type="button"
        disabled={lockPending === table.id}
        onClick={() => onSelectTable(table)}
        style={
          layout === "map"
            ? { position: "absolute", left: table.x, top: table.y, width: table.width, height: table.height }
            : undefined
        }
        className={`${layout === "grid" ? "h-16 w-full" : ""} relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 border-white/20 px-2 py-1.5 text-center text-white shadow-md transition active:scale-[0.98] ${TABLE_STATUS_COLORS[status] ?? "bg-gray-500"} ${
          unionHost ? "ring-2 ring-white/40 ring-offset-1 ring-offset-transparent" : ""
        } ${lockPending === table.id ? "opacity-50" : ""}`}
      >
        {unionHost && annexedCount > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-[hsl(var(--pg-primary))] px-1.5 py-0.5 text-2xs font-bold leading-none text-[hsl(var(--pg-primary-foreground))] shadow-sm">
            +{annexedCount}
          </span>
        )}

        <span
          className={`max-w-full truncate font-bold leading-tight ${tableLabelFontClass(title, labelWidth)}`}
        >
          {title}
        </span>

        {meta ? (
          <span className="max-w-full truncate text-2xs font-medium leading-tight text-white/85">
            {meta}
          </span>
        ) : null}
      </button>
    );
  };

  const statusSummary = useMemo(() => {
    const counts: Partial<Record<TableStatus, number>> = {};
    for (const table of visibleTables) {
      counts[table.status] = (counts[table.status] ?? 0) + 1;
    }
    return counts;
  }, [visibleTables]);

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[hsl(var(--pg-background))]">
      {/* Telefono: una riga sola (operatore + stato collegamento), il resto dello schermo ai tavoli */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[hsl(var(--pg-border))] px-3 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${!isOffline ? "bg-green-500" : "bg-yellow-500"}`}
            title={!isOffline ? "Online" : "Offline"}
            aria-label={!isOffline ? "Online" : "Offline"}
          />
          <h1 className="truncate text-base font-bold">
            {operator.firstName} {operator.lastName}
          </h1>
          {isOffline && (
            <span className="shrink-0 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-800">
              Offline
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onOpenCounter && (
            <Button
              variant="outline"
              className="h-9 shrink-0 px-3 text-sm"
              disabled={isOffline}
              onClick={onOpenCounter}
            >
              Asporto
            </Button>
          )}
          <Button variant="outline" className="h-9 shrink-0 px-3 text-sm" onClick={onLogout}>
            Esci
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-col overflow-hidden">
        {cashClosed && <CashClosedBanner />}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 pt-2">
          {message && (
            <p className="mb-3 shrink-0 rounded bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
          )}

          {logoutConfirm && (
            <ConfirmModal
              title="Uscire dalla sessione?"
              message="Dovrai reinserire il PIN per accedere. Se hai finito di lavorare usa Fine turno."
              confirmLabel="Esci"
              onConfirm={onConfirmLogout}
              onCancel={onCancelLogout}
              secondaryLabel="Fine turno"
              onSecondary={onEndShift}
            />
          )}

          {/* Sale a sinistra, Mappa/Lista come icone a destra: una sola riga */}
          <div className="mb-2 flex shrink-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              {!reordering && (
                <RoomTabs rooms={rooms} selectedRoomId={selectedRoomId} onSelect={setSelectedRoomId} />
              )}
            </div>
            {view === "list" && canReorder && !reordering && reorderTables.length > 1 && (
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 px-3 text-sm"
                disabled={isOffline}
                onClick={() => setReordering(true)}
              >
                Riordina
              </Button>
            )}
            <div
              className="inline-flex shrink-0 rounded-lg border border-[hsl(var(--pg-border))] p-0.5"
              role="group"
              aria-label="Vista tavoli"
            >
              {(["map", "list"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  aria-label={option === "map" ? "Mappa" : "Lista"}
                  title={option === "map" ? "Mappa" : "Lista"}
                  disabled={reordering}
                  onClick={() => changeView(option)}
                  className={`flex h-8 w-10 items-center justify-center rounded-md ${
                    view === option
                      ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                      : "text-[hsl(var(--pg-muted-foreground))]"
                  }`}
                >
                  {option === "map" ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                      <rect x="3" y="3" width="8" height="8" rx="2" />
                      <rect x="13" y="3" width="8" height="8" rx="2" />
                      <rect x="3" y="13" width="8" height="8" rx="2" />
                      <rect x="13" y="13" width="8" height="8" rx="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {view === "list" ? (
              reordering ? (
                <TableReorderList
                  key={orderRoomId ?? "none"}
                  tables={reorderTables}
                  onCancel={() => setReordering(false)}
                  onSave={async (ids) => {
                    await onSaveTableOrder(orderRoomId, ids);
                    setReordering(false);
                  }}
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <TableList
                    tables={gridTables}
                    allTables={tables}
                    lockPending={lockPending}
                    onSelectTable={onSelectTable}
                    empty={emptyMessage}
                  />
                </div>
              )
            ) : (
              <TableMapViewport
                tables={displayTables}
                maxScale={1.15}
                align="start"
                className="!p-0"
                renderGrid={() =>
                  displayTables.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 pb-2">
                      {gridTables.map((table) => renderTable(table, "grid", GRID_LABEL_WIDTH))}
                    </div>
                  ) : (
                    emptyMessage
                  )
                }
              >
                {(scale) => (
                  <>
                    {displayTables.map((table) => renderTable(table, "map", table.width * scale))}

                    {displayTables.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">{emptyMessage}</div>
                    )}
                  </>
                )}
              </TableMapViewport>
            )}

            {!reordering && (
              // Solo gli stati presenti in sala, su una riga: la legenda completa sta nel tooltip
              <div
                className="flex shrink-0 items-center gap-x-3 overflow-x-auto whitespace-nowrap border-t border-[hsl(var(--pg-border))] px-1 py-2 text-xs text-[hsl(var(--pg-muted-foreground))]"
                title={(Object.keys(TABLE_STATUS_DOT) as TableStatus[]).map((st) => TABLE_STATUS_LABELS[st]).join(" · ")}
              >
                <span className="font-medium text-[hsl(var(--pg-foreground))]">
                  {visibleTables.length} {visibleTables.length === 1 ? "tavolo" : "tavoli"}
                </span>
                {(Object.keys(TABLE_STATUS_DOT) as TableStatus[])
                  .filter((status) => (statusSummary[status] ?? 0) > 0)
                  .map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${TABLE_STATUS_DOT[status]}`} />
                      {TABLE_STATUS_LABELS[status]}
                      <span className="tabular-nums text-[hsl(var(--pg-foreground))]">{statusSummary[status]}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>

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
    </div>
  );
}
