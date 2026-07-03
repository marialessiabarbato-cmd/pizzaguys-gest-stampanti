import type { LocationDiscountPreset } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";

export function DiscountPresetsBar({
  presets,
  hasDiscounts,
  loading,
  onApply,
  onClear,
}: {
  presets: LocationDiscountPreset[];
  hasDiscounts: boolean;
  loading?: boolean;
  onApply: (preset: LocationDiscountPreset) => void;
  onClear: () => void;
}) {
  if (presets.length === 0 && !hasDiscounts) return null;

  return (
    <div className="space-y-2">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              className="h-10 min-h-[40px] px-3 text-sm"
              variant="outline"
              disabled={loading}
              onClick={() => onApply(preset)}
            >
              {preset.label} ({preset.percent}%)
            </Button>
          ))}
        </div>
      )}
      {hasDiscounts && (
        <Button
          type="button"
          className="h-9 w-full text-sm"
          variant="ghost"
          disabled={loading}
          onClick={onClear}
        >
          Annulla sconti
        </Button>
      )}
    </div>
  );
}
