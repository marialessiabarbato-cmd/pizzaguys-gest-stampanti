import { QUICK_NOTES } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useEffect, useRef, useState } from "react";
import { EU_ALLERGENS } from "../allergens";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

/** Testo inserito in nota per un allergene: maiuscolo per farlo risaltare in comanda. */
export function allergenNoteTag(label: string): string {
  return `ALLERGIA ${label.toLocaleUpperCase("it-IT")}`;
}

function noteParts(note: string): string[] {
  return note
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

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

  const hasAllergen = (label: string) =>
    noteParts(note).some((p) => p.toLocaleUpperCase("it-IT") === allergenNoteTag(label));

  /** Un tocco aggiunge "ALLERGIA X" alla nota, un secondo tocco lo toglie. */
  const toggleAllergen = (label: string) => {
    const tag = allergenNoteTag(label);
    setNote((prev) => {
      const parts = noteParts(prev);
      const rest = parts.filter((p) => p.toLocaleUpperCase("it-IT") !== tag);
      return (rest.length < parts.length ? rest : [...parts, tag]).join(", ");
    });
    textareaRef.current?.focus();
  };

  const save = () => onSave(note.replace(/\s+/g, " ").trim());

  return (
    <BottomSheet maxHeightClass="max-h-[75dvh]" onDismiss={onCancel}>
      <div className="min-h-0 overflow-y-auto px-4 pb-2 pt-1">
        <div className="mb-1 flex min-h-10 items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Nota riga</h2>
          {/* Accanto al titolo: comparendo non sposta i pulsanti sotto il dito. */}
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
          className="w-full resize-none rounded-xl border border-[hsl(var(--pg-border))] px-3 py-3 text-base"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_NOTES.map((q) => (
            <button
              key={q}
              type="button"
              // Evita che il tap tolga il focus al campo (e chiuda la tastiera).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addQuickNote(q)}
              className="min-h-10 rounded-full bg-[hsl(var(--pg-muted))] px-3.5 text-sm font-medium"
            >
              {q}
            </button>
          ))}
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold text-red-700">Allergie e intolleranze</h3>
        <div className="flex flex-wrap gap-2">
          {EU_ALLERGENS.map((a) => {
            const active = hasAllergen(a.label);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleAllergen(a.label)}
                className={`min-h-10 rounded-full border px-3.5 text-sm font-medium ${
                  active ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
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
