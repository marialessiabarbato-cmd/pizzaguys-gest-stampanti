import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { normalizeLineNote } from "../menu";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";
import { NoteEditor } from "./NoteEditor";

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

  const save = () => onSave(normalizeLineNote(note));

  return (
    <BottomSheet maxHeightClass="max-h-[75dvh]" onDismiss={onCancel}>
      <div className="min-h-0 overflow-y-auto px-4 pb-2 pt-1">
        <NoteEditor title="Nota riga" subtitle={lineName} value={note} onChange={setNote} onSubmit={save} />
      </div>
      <div className={bottomSheetFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button className="min-h-12 flex-1" onClick={save}>
          {!note.trim() && initialNote ? "Rimuovi nota" : "Salva"}
        </Button>
      </div>
    </BottomSheet>
  );
}
