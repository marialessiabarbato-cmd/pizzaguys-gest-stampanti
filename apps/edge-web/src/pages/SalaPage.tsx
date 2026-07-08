import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { Layer, Rect, Stage, Text } from "react-konva";
import { ConfirmModal } from "@/components/ConfirmModal";
import { edgeApi } from "@/lib/api";
import { formatTableLabel } from "@/lib/table-display";

interface Room {
  id: string;
  name: string;
  sortOrder: number;
  applyCoverCharge: boolean;
}

interface Table {
  id: string;
  roomId: string | null;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultGuests: number;
  isVirtual: boolean;
  virtualType: string | null;
}

export function SalaPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCoverCharge, setNewRoomCoverCharge] = useState(true);
  const [newTable, setNewTable] = useState({ label: "", guests: 2 });
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(false);
  const [confirmDeleteTable, setConfirmDeleteTable] = useState<{ id: string; label: string } | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([
      edgeApi<Room[]>("/api/rooms"),
      edgeApi<Table[]>("/api/tables"),
    ]);
    setRooms(r);
    setTables(t);
    setActiveRoomId((current) => {
      if (current && r.some((room) => room.id === current)) return current;
      return r[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = await edgeApi<Room>("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: newRoomName,
        sortOrder: rooms.length,
        applyCoverCharge: newRoomCoverCharge,
      }),
    });
    setNewRoomName("");
    setNewRoomCoverCharge(true);
    setActiveRoomId(room.id);
    setShowCreateRoomModal(false);
    setShowCreateTableModal(true);
    void load();
  };

  const createTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId) return;
    const roomPhysical = tables.filter((t) => t.roomId === activeRoomId && !t.isVirtual);
    const tableSize = 80;
    const gap = 16;
    const startX = 20;
    const startY = 120;
    await edgeApi("/api/tables", {
      method: "POST",
      body: JSON.stringify({
        roomId: activeRoomId,
        label: newTable.label,
        x: startX + roomPhysical.length * (tableSize + gap),
        y: startY,
        width: tableSize,
        height: tableSize,
        defaultGuests: newTable.guests,
      }),
    });
    setNewTable({ label: "", guests: 2 });
    setShowCreateTableModal(false);
    void load();
  };

  const moveTable = async (id: string, x: number, y: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
    await edgeApi(`/api/tables/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ x, y }),
    });
  };

  const deleteTable = async (id: string) => {
    await edgeApi(`/api/tables/${id}`, { method: "DELETE" });
    void load();
  };

  const deleteRoom = async () => {
    const room = rooms.find((r) => r.id === activeRoomId);
    if (!activeRoomId || !room) return;
    try {
      setMessage("");
      await edgeApi(`/api/rooms/${activeRoomId}`, { method: "DELETE" });
      const remaining = rooms.filter((r) => r.id !== activeRoomId);
      setActiveRoomId(remaining[0]?.id ?? null);
      setRooms(remaining);
      setTables((prev) => prev.filter((t) => t.roomId !== activeRoomId));
      setShowCreateRoomModal(false);
      setShowCreateTableModal(false);
      setMessage(`Sala "${room.name}" eliminata`);
      setConfirmDeleteRoom(false);
      void load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore eliminazione sala");
    }
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const roomTables = tables.filter((t) => t.roomId === activeRoomId);
  const virtualTables = tables.filter((t) => t.isVirtual);
  const physicalTables = roomTables.filter((t) => !t.isVirtual);
  const deleteRoomMessage = activeRoom
    ? roomTables.length > 0
      ? `Eliminare la sala "${activeRoom.name}" e i suoi ${roomTables.length} tavoli?`
      : `Eliminare la sala "${activeRoom.name}"?`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Sala Builder</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Organizza le sale e trascina i tavoli sulla mappa. Doppio click su un tavolo per eliminarlo.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setShowCreateRoomModal(true)}>
          Nuova sala
        </Button>
      </div>

      {message && (
        <p className="rounded-md bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
      )}

      {rooms.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {rooms.map((r) => (
            <Button
              key={r.id}
              variant={activeRoomId === r.id ? "default" : "outline"}
              onClick={() => setActiveRoomId(r.id)}
            >
              {r.name}
            </Button>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 px-4 py-3 text-sm text-[hsl(var(--pg-muted-foreground))]">
          Nessuna sala configurata.
        </div>
      )}

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{activeRoom?.name ?? "Mappa 2D"}</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-3 text-xs"
                  disabled={!activeRoomId}
                  onClick={() => setShowCreateTableModal(true)}
                >
                  Nuovo tavolo
                </Button>
                {activeRoom && (
                  <Button
                    type="button"
                    variant="danger"
                    className="h-8 px-3 text-xs"
                    onClick={() => setConfirmDeleteRoom(true)}
                  >
                    Elimina sala
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {activeRoom
                ? `${physicalTables.length} tavol${physicalTables.length === 1 ? "o" : "i"} in ${activeRoom.name}`
                : "Seleziona o crea una sala per iniziare"}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30 p-2">
              <Stage width={900} height={520}>
                <Layer>
                  {roomTables.map((t) => (
                    <TableShape
                      key={t.id}
                      table={t}
                      onMove={moveTable}
                      onDelete={(id, label) => setConfirmDeleteTable({ id, label })}
                    />
                  ))}
                  {virtualTables.map((t) => (
                    <TableShape
                      key={t.id}
                      table={t}
                      onMove={moveTable}
                      onDelete={(id, label) => setConfirmDeleteTable({ id, label })}
                      virtual
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Tavolo sala
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Tavolo virtuale (Asporto/Delivery)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {confirmDeleteRoom && (
        <ConfirmModal
          title="Eliminare sala?"
          message={deleteRoomMessage}
          confirmLabel="Elimina"
          variant="danger"
          onConfirm={() => void deleteRoom()}
          onCancel={() => setConfirmDeleteRoom(false)}
        />
      )}

      {confirmDeleteTable && (
        <ConfirmModal
          title="Eliminare tavolo?"
          message={`Rimuovere ${confirmDeleteTable.label} dalla mappa?`}
          confirmLabel="Elimina"
          variant="danger"
          onConfirm={() => {
            void deleteTable(confirmDeleteTable.id);
            setConfirmDeleteTable(null);
          }}
          onCancel={() => setConfirmDeleteTable(null)}
        />
      )}

      {showCreateRoomModal && (
        <ActionModal
          title="Nuova sala"
          onClose={() => setShowCreateRoomModal(false)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setShowCreateRoomModal(false)}>
                Annulla
              </Button>
              <Button type="submit" form="create-room-form">
                Crea sala
              </Button>
            </>
          }
        >
          <form id="create-room-form" onSubmit={createRoom} className="space-y-3">
            <input
              className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
              placeholder="Es. Interna, Esterna, Terrazza"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              required
              autoFocus
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRoomCoverCharge}
                onChange={(e) => setNewRoomCoverCharge(e.target.checked)}
              />
              Applica coperto sui tavoli di questa sala
            </label>
          </form>
        </ActionModal>
      )}

      {showCreateTableModal && (
        <ActionModal
          title="Nuovo tavolo"
          onClose={() => setShowCreateTableModal(false)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setShowCreateTableModal(false)}>
                Annulla
              </Button>
              <Button type="submit" form="create-table-form" disabled={!activeRoomId}>
                Aggiungi tavolo
              </Button>
            </>
          }
        >
          <form id="create-table-form" onSubmit={createTable} className="space-y-3">
            <input
              className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
              placeholder="Etichetta (es. T1)"
              value={newTable.label}
              onChange={(e) => setNewTable({ ...newTable, label: e.target.value })}
              required
              autoFocus
            />
            <input
              type="number"
              min={1}
              max={30}
              className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
              value={newTable.guests}
              onChange={(e) => setNewTable({ ...newTable, guests: Number(e.target.value) })}
            />
          </form>
        </ActionModal>
      )}
    </div>
  );
}

function ActionModal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] shadow-xl">
        <div className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-[hsl(var(--pg-muted-foreground))] hover:bg-[hsl(var(--pg-muted))]/50"
            onClick={onClose}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[hsl(var(--pg-border))] px-4 py-3">{footer}</div>
      </div>
    </div>
  );
}

function TableShape({
  table,
  onMove,
  onDelete,
  virtual,
}: {
  table: Table;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string, label: string) => void;
  virtual?: boolean;
}) {
  const label = formatTableLabel(table.label);
  const titleY = virtual ? table.y + table.height / 2 - 8 : table.y + table.height / 2 - 12;
  const metaY = table.y + table.height / 2 + 6;

  return (
    <>
      <Rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        fill={virtual ? "#f59e0b" : "#22c55e"}
        cornerRadius={8}
        shadowColor="#000"
        shadowBlur={6}
        shadowOpacity={0.18}
        shadowOffset={{ x: 0, y: 2 }}
        draggable
        onDragEnd={(e) => onMove(table.id, e.target.x(), e.target.y())}
        onDblClick={() => onDelete(table.id, table.label)}
      />
      <Text
        x={table.x + 6}
        y={titleY}
        width={table.width - 12}
        align="center"
        text={label}
        fontSize={13}
        fontStyle="bold"
        fill="#fff"
        ellipsis
      />
      {!virtual && (
        <Text
          x={table.x + 6}
          y={metaY}
          width={table.width - 12}
          align="center"
          text={`${table.defaultGuests} cop.`}
          fontSize={10}
          fill="rgba(255,255,255,0.92)"
        />
      )}
    </>
  );
}
