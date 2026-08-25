import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

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
    <BottomSheet maxHeightClass="max-h-[75dvh]">
      <div className="px-4 pb-2 pt-1">
        <h2 className="mb-1 text-lg font-semibold">Nota riga</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{lineName}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es. ben cotta, senza cipolla..."
          rows={3}
          className="w-full resize-none rounded-xl border border-[hsl(var(--pg-border))] px-3 py-3 text-base"
        />
      </div>
      <div className={bottomSheetFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button className="min-h-12 flex-1" onClick={() => onSave(note.trim())}>
          Salva
        </Button>
      </div>
    </BottomSheet>
  );
}
