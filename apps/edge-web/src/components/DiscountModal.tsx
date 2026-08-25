import type { LocationDiscountPreset } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useState } from "react";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";
import { PinModal } from "./PinModal";

const FALLBACK_PRESETS = [5, 10, 15, 20, 25, 30];

export function DiscountModal({
  lineName,
  maxPercent,
  pinThreshold,
  presets = [],
  onApply,
  onCancel,
  error,
}: {
  lineName: string;
  maxPercent: number;
  pinThreshold: number;
  presets?: LocationDiscountPreset[];
  onApply: (percent: number, managerPin?: string) => void;
  onCancel: () => void;
  error?: string;
}) {
  const [percent, setPercent] = useState(10);
  const [needsPin, setNeedsPin] = useState(false);

  const fallbackPresets = FALLBACK_PRESETS.filter((p) => p <= maxPercent);

  const handleApply = () => {
    if (percent < 1 || percent > maxPercent) return;
    if (percent > pinThreshold) {
      setNeedsPin(true);
      return;
    }
    onApply(percent);
  };

  if (needsPin) {
    return (
      <PinModal
        title={`PIN manager — sconto ${percent}%`}
        onComplete={(pin) => onApply(percent, pin)}
        onCancel={() => setNeedsPin(false)}
        error={error}
      />
    );
  }

  return (
    <OffCanvas widthClass="max-w-md" onClose={onCancel}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-1 text-lg font-bold">Sconto riga</h2>
        <p className="mb-4 text-sm text-[hsl(var(--pg-muted-foreground))]">{lineName}</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {presets.length > 0
            ? presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPercent(p.percent)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${
                    percent === p.percent
                      ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                      : "border-[hsl(var(--pg-border))]"
                  }`}
                >
                  {p.label}
                </button>
              ))
            : fallbackPresets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPercent(p)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${
                    percent === p
                      ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                      : "border-[hsl(var(--pg-border))]"
                  }`}
                >
                  {p}%
                </button>
              ))}
        </div>

        <label className="mb-4 block text-sm">
          Percentuale (max {maxPercent}%)
          <input
            type="number"
            min={1}
            max={maxPercent}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="mt-1 min-h-12 w-full rounded-xl border border-[hsl(var(--pg-border))] px-3 py-2 text-lg"
          />
        </label>

        {percent > pinThreshold && (
          <p className="mb-3 text-xs text-orange-600">
            Oltre {pinThreshold}% — richiesto PIN manager
          </p>
        )}

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="min-h-12 flex-1" onClick={onCancel}>
          Annulla
        </Button>
        <Button className="min-h-12 flex-1" onClick={handleApply}>
          Applica
        </Button>
      </div>
    </OffCanvas>
  );
}
