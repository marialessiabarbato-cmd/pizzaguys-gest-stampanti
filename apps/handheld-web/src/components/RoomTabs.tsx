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
    <div className="flex flex-wrap gap-2">
      {rooms.map((room) => (
        <Button
          key={room.id}
          type="button"
          className="h-10 min-w-[88px] px-4 text-sm"
          variant={selectedRoomId === room.id ? "default" : "outline"}
          onClick={() => onSelect(room.id)}
        >
          {room.name}
        </Button>
      ))}
    </div>
  );
}
