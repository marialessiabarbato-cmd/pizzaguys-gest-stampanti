import { Button } from "@pizzaguys/ui";

export function RoomTabs({
  rooms,
  selectedRoomId,
  onSelect,
}: {
  rooms: Array<{ id: string; name: string }>;
  selectedRoomId: string;
  onSelect: (roomId: string) => void;
}) {
  if (rooms.length <= 1) return null;

  return (
    <div className="flex min-w-0 gap-1.5 overflow-x-auto">
      {rooms.map((room) => (
        <Button
          key={room.id}
          type="button"
          className="h-9 shrink-0 px-4 text-sm"
          variant={selectedRoomId === room.id ? "default" : "outline"}
          onClick={() => onSelect(room.id)}
        >
          {room.name}
        </Button>
      ))}
    </div>
  );
}
