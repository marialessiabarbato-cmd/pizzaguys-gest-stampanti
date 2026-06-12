import { Button } from "@pizzaguys/ui";

interface Props {
  tableLabel: string;
  guests: number;
  onChange: (guests: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GuestsModal({ tableLabel, guests, onChange, onConfirm, onCancel }: Props) {
  const dec = () => onChange(Math.max(1, guests - 1));
  const inc = () => onChange(Math.min(30, guests + 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-1 text-center text-lg font-bold">Coperti</h2>
        <p className="mb-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">{tableLabel}</p>
        <div className="flex items-center justify-center gap-4">
          <Button type="button" variant="outline" className="h-14 w-14 text-2xl" onClick={dec}>
            −
          </Button>
          <span className="min-w-[3rem] text-center text-4xl font-bold tabular-nums">{guests}</span>
          <Button type="button" variant="outline" className="h-14 w-14 text-2xl" onClick={inc}>
            +
          </Button>
        </div>
        <div className="mt-6 flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="button" className="flex-1" onClick={onConfirm}>
            Apri tavolo
          </Button>
        </div>
      </div>
    </div>
  );
}
