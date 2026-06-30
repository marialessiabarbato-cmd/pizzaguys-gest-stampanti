import { Button } from "@pizzaguys/ui";
import { useState } from "react";

export function NoteModal({
  lineName,
  initialNote,
  onSave,
  onCancel,
}: {
  lineName: string;
  initialNote?: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Nota riga</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{lineName}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es. ben cotta, senza cipolla..."
          rows={3}
          className="mb-4 w-full resize-none rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2 text-sm"
          autoFocus
        />
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button className="min-h-12 flex-1" onClick={() => onSave(note.trim())}>
            Salva
          </Button>
        </div>
      </div>
    </div>
  );
}
