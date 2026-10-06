import { QUICK_NOTES } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useRef, useState } from "react";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

/** Nota sulla riga comanda: stesso comportamento della nota del palmare, in pannello laterale. */
export function NotePanel({
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const addQuickNote = (text: string) => {
    setNote((prev) => {
      const current = prev.trim();
      if (current.toLowerCase().includes(text.toLowerCase())) return prev;
      return current ? `${current}, ${text.toLowerCase()}` : text;
    });
    textareaRef.current?.focus();
  };

  const save = () => onSave(note.replace(/\s+/g, " ").trim());

  return (
    <OffCanvas widthClass="max-w-md" zClass="z-[60]" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-1 flex min-h-10 items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Nota riga</h2>
          {note.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setNote("");
                textareaRef.current?.focus();
              }}
              className="min-h-10 px-2 text-sm font-medium text-red-600"
            >
              Cancella testo
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{lineName}</p>
        <textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // La nota va in comanda su una riga: Invio salva.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Es. ben cotta, senza cipolla..."
          rows={3}
          maxLength={200}
          enterKeyHint="done"
          className="w-full resize-none rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 py-3 text-base"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_NOTES.map((q) => (
            <button
              key={q}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addQuickNote(q)}
              className="min-h-11 rounded-full bg-[hsl(var(--pg-muted))] px-4 text-sm font-medium"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button className="min-h-12 flex-1" onClick={save}>
          {!note.trim() && initialNote ? "Rimuovi nota" : "Salva"}
        </Button>
      </div>
    </OffCanvas>
  );
}
