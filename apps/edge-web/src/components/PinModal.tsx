import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";
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
    <OffCanvas widthClass="max-w-sm" zClass="z-[60]" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-4 text-center text-lg font-bold">{title}</h2>
        <PinPad
          pin={pin}
          onChange={setPin}
          onComplete={(v) => onComplete(v)}
          error={error}
        />
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="ghost" className="min-h-12 w-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </OffCanvas>
  );
}
