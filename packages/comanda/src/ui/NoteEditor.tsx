import { QUICK_NOTES } from "@pizzaguys/types";
import { useEffect, useRef } from "react";
import { EU_ALLERGENS } from "../allergens";

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

/**
 * Nota di riga: testo libero, note rapide e allergeni.
 * Usata dalla finestra "Nota riga" e dalla finestra varianti.
 */
export function NoteEditor({
  title,
  subtitle,
  value,
  onChange,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (next: string) => void;
  /** Invio sul campo (la nota va in comanda su una riga). */
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const addQuickNote = (text: string) => {
    const current = value.trim();
    if (!current.toLowerCase().includes(text.toLowerCase())) {
      onChange(current ? `${current}, ${text.toLowerCase()}` : text);
    }
    textareaRef.current?.focus();
  };

  const hasAllergen = (label: string) =>
    noteParts(value).some((p) => p.toLocaleUpperCase("it-IT") === allergenNoteTag(label));

  /** Un tocco aggiunge "ALLERGIA X" alla nota, un secondo tocco lo toglie. */
  const toggleAllergen = (label: string) => {
    const tag = allergenNoteTag(label);
    const parts = noteParts(value);
    const rest = parts.filter((p) => p.toLocaleUpperCase("it-IT") !== tag);
    onChange((rest.length < parts.length ? rest : [...parts, tag]).join(", "));
    textareaRef.current?.focus();
  };

  return (
    <>
      <div className="mb-1 flex min-h-10 items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {/* Accanto al titolo: comparendo non sposta i pulsanti sotto il dito. */}
        {value.trim() && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              textareaRef.current?.focus();
            }}
            className="min-h-10 px-2 text-sm font-medium text-red-600"
          >
            Cancella testo
          </button>
        )}
      </div>
      {subtitle && <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{subtitle}</p>}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // La nota va in comanda su una riga: Invio conferma.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
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
    </>
  );
}
