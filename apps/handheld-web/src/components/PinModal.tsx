import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { PinPad } from "./PinPad";

interface Props {
  title: string;
  onComplete: (pin: string) => void;
  onCancel: () => void;
  error?: string;
}

export function PinModal({ title, onComplete, onCancel, error }: Props) {
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-6 shadow-xl">
        <h2 className="mb-4 text-center text-lg font-bold">{title}</h2>
        <PinPad
          pin={pin}
          onChange={setPin}
          onComplete={(v) => onComplete(v)}
          error={error}
        />
        <Button variant="ghost" className="mt-4 w-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
