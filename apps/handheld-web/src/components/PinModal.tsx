import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { BottomSheet, bottomSheetFooterClass } from "./BottomSheet";
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
    <BottomSheet maxHeightClass="max-h-[85dvh]" zClass="z-[60]">
      <div className="px-4 pb-2 pt-1">
        <h2 className="mb-4 text-center text-lg font-bold">{title}</h2>
        <PinPad
          pin={pin}
          onChange={setPin}
          onComplete={(v) => onComplete(v)}
          error={error}
        />
      </div>
      <div className={bottomSheetFooterClass}>
        <Button variant="ghost" className="min-h-12 w-full" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </BottomSheet>
  );
}
