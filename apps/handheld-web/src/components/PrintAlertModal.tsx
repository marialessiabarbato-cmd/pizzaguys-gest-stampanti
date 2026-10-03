import { Button } from "@pizzaguys/ui";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";

/** Avviso bloccante: la stampa in cucina/bar non è uscita (stampante spenta, carta, rete). */
export function PrintAlertModal({ messages, onClose }: { messages: string[]; onClose: () => void }) {
  return (
    <BottomSheet maxHeightClass="max-h-[70dvh]" zClass="z-[70]">
      <div className="px-4 pb-2 pt-1">
        <h2 className="text-lg font-bold text-[hsl(var(--pg-danger))]">⚠ Stampa non riuscita</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[hsl(var(--pg-muted-foreground))]">
          L'ordine è registrato ma il ticket non è uscito: avvisa la cucina e controlla la stampante
          (accesa, carta, cavo di rete).
        </p>
      </div>
      <div className={bottomSheetFooterClass}>
        <Button className="min-h-12 flex-1" onClick={onClose}>
          Ho capito
        </Button>
      </div>
    </BottomSheet>
  );
}
