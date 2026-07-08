import type { TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { GuestsModal, type GuestsConfirmPayload } from "../components/GuestsModal";
import { RoomTabs } from "../components/RoomTabs";
import { TableMapViewport } from "../components/TableMapViewport";
import {
  TABLE_STATUS_COLORS,
  TABLE_STATUS_DOT,
  TABLE_STATUS_LABELS,
  filterMapVisibleTables,
  filterTablesByRoom,
  isUnionHost,
  mapTableMeta,
  tableLabelFontClass,
} from "../lib/table-display";
import type { LiveTable, Operator } from "../lib/types";

export function MapScreen({
  operator,
  tables,
  rooms,
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
  rooms: Array<{ id: string; name: string }>;
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
  const [selectedRoomId, setSelectedRoomId] = useState("");

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

  const statusSummary = useMemo(() => {
    const counts: Partial<Record<TableStatus, number>> = {};
    for (const table of visibleTables) {
      counts[table.status] = (counts[table.status] ?? 0) + 1;
    }
    return counts;
  }, [visibleTables]);

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[hsl(var(--pg-background))]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">Mappa sala</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                !isOffline ? "bg-green-500/20 text-green-700" : "bg-yellow-500/20 text-yellow-800"
              }`}
            >
              {!isOffline ? "Online" : "Offline"}
            </span>
          </div>
          <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
            {operator.firstName} {operator.lastName}
          </p>
        </div>
        <Button variant="outline" className="h-10 shrink-0 px-4 text-sm" onClick={onLogout}>
          Esci
        </Button>
      </header>

      <main className="flex min-h-0 flex-col overflow-hidden p-3">
        {message && (
          <p className="mb-3 shrink-0 rounded bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
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

        <div className="mb-2 space-y-2">
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
            {visibleTables.length} {visibleTables.length === 1 ? "tavolo" : "tavoli"}
            {activeRoomName ? ` · ${activeRoomName}` : " in sala"}
          </p>
          <RoomTabs rooms={rooms} selectedRoomId={selectedRoomId} onSelect={setSelectedRoomId} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TableMapViewport tables={displayTables} maxScale={1.15} align="start" className="!p-0">
            {(scale) => (
              <>
                {displayTables.map((table) => {
                  const unionHost = isUnionHost(table);
                  const annexedCount = table.linkedTableIds?.length ?? 0;
                  const { title, meta } = mapTableMeta(table, salaTables);
                  const labelWidth = table.width * scale;
                  const status = table.status;

                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={lockPending === table.id}
                      onClick={() => onSelectTable(table)}
                      style={{
                        position: "absolute",
                        left: table.x,
                        top: table.y,
                        width: table.width,
                        height: table.height,
                      }}
                      className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border-2 border-white/20 px-2 py-1.5 text-center text-white shadow-md transition active:scale-[0.98] ${TABLE_STATUS_COLORS[status] ?? "bg-gray-500"} ${
                        unionHost ? "ring-2 ring-white/40 ring-offset-1 ring-offset-transparent" : ""
                      } ${lockPending === table.id ? "opacity-50" : ""}`}
                    >
                      {unionHost && annexedCount > 0 && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-[hsl(var(--pg-primary))] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[hsl(var(--pg-primary-foreground))] shadow-sm">
                          +{annexedCount}
                        </span>
                      )}

                      <span
                        className={`max-w-full truncate font-bold leading-tight ${tableLabelFontClass(title, labelWidth)}`}
                      >
                        {title}
                      </span>

                      <span className="max-w-full truncate text-[11px] font-medium leading-tight text-white/85">
                        {meta}
                      </span>
                    </button>
                  );
                })}

                {displayTables.length === 0 && (
                  <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                    {activeRoomName
                      ? `Nessun tavolo in ${activeRoomName}`
                      : "Nessun tavolo in sala — configura la mappa da Admin"}
                  </p>
                )}
              </>
            )}
          </TableMapViewport>

          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[hsl(var(--pg-border))] px-4 py-2.5 text-xs text-[hsl(var(--pg-muted-foreground))]">
            {(Object.keys(TABLE_STATUS_DOT) as TableStatus[]).map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${TABLE_STATUS_DOT[status]}`} />
                {TABLE_STATUS_LABELS[status]}
                {statusSummary[status] != null && statusSummary[status]! > 0 && (
                  <span className="tabular-nums text-[hsl(var(--pg-foreground))]">
                    ({statusSummary[status]})
                  </span>
                )}
              </span>
            ))}
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
