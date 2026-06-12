import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { Layer, Rect, Stage, Text } from "react-konva";
import { edgeApi } from "@/lib/api";

interface Room {
  id: string;
  name: string;
  sortOrder: number;
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
  const [newTable, setNewTable] = useState({ label: "", guests: 2 });
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
      body: JSON.stringify({ name: newRoomName, sortOrder: rooms.length }),
    });
    setNewRoomName("");
    setActiveRoomId(room.id);
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
    const tableCount = tables.filter((t) => t.roomId === activeRoomId && !t.isVirtual).length;
    const confirmMessage =
      tableCount > 0
        ? `Eliminare la sala "${room.name}" e i suoi ${tableCount} tavoli?`
        : `Eliminare la sala "${room.name}"?`;
    if (!confirm(confirmMessage)) return;
    try {
      setMessage("");
      await edgeApi(`/api/rooms/${activeRoomId}`, { method: "DELETE" });
      const remaining = rooms.filter((r) => r.id !== activeRoomId);
      setActiveRoomId(remaining[0]?.id ?? null);
      setRooms(remaining);
      setTables((prev) => prev.filter((t) => t.roomId !== activeRoomId));
      setMessage(`Sala "${room.name}" eliminata`);
      void load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore eliminazione sala");
    }
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const roomTables = tables.filter((t) => t.roomId === activeRoomId);
  const virtualTables = tables.filter((t) => t.isVirtual);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sala Builder</h1>

      {message && (
        <p className="rounded-md bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
      )}

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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Mappa 2D</CardTitle>
          </CardHeader>
          <CardContent>
            <Stage width={720} height={480} className="rounded border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/30">
              <Layer>
                {roomTables.map((t) => (
                  <TableShape key={t.id} table={t} onMove={moveTable} onDelete={deleteTable} />
                ))}
                {virtualTables.map((t) => (
                  <TableShape key={t.id} table={t} onMove={moveTable} onDelete={deleteTable} virtual />
                ))}
              </Layer>
            </Stage>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nuova sala</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createRoom} className="flex gap-2">
                <input
                  className="flex-1 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  placeholder="Nome sala"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
                <Button type="submit">+</Button>
              </form>
            </CardContent>
          </Card>

          {activeRoom && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sala attiva</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">{activeRoom.name}</p>
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  {roomTables.length} tavol{roomTables.length === 1 ? "o" : "i"} in questa sala
                </p>
                <Button type="button" variant="danger" className="w-full" onClick={() => void deleteRoom()}>
                  Elimina sala
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nuovo tavolo</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createTable} className="space-y-2">
                <input
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  placeholder="Etichetta (es. T1)"
                  value={newTable.label}
                  onChange={(e) => setNewTable({ ...newTable, label: e.target.value })}
                  required
                />
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  value={newTable.guests}
                  onChange={(e) => setNewTable({ ...newTable, guests: Number(e.target.value) })}
                />
                <Button type="submit" className="w-full" disabled={!activeRoomId}>
                  Aggiungi tavolo
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
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
  onDelete: (id: string) => void;
  virtual?: boolean;
}) {
  return (
    <>
      <Rect
        x={table.x}
        y={table.y}
        width={table.width}
        height={table.height}
        fill={virtual ? "#f59e0b" : "#22c55e"}
        cornerRadius={8}
        draggable
        onDragEnd={(e) => onMove(table.id, e.target.x(), e.target.y())}
        onDblClick={() => {
          if (confirm(`Eliminare ${table.label}?`)) onDelete(table.id);
        }}
      />
      <Text
        x={table.x + 8}
        y={table.y + table.height / 2 - 8}
        text={`${table.label} (${table.defaultGuests})`}
        fontSize={14}
        fill="#fff"
      />
    </>
  );
}
