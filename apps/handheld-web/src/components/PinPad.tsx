import { Button } from "@pizzaguys/ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

export function PinPad({
  pin,
  onChange,
  onComplete,
  error,
}: {
  pin: string;
  onChange: (pin: string) => void;
  onComplete: (pin: string) => void;
  error?: string;
}) {
  const press = (key: string) => {
    if (key === "C") {
      onChange("");
      return;
    }
    if (key === "⌫") {
      onChange(pin.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    onChange(next);
    if (next.length === 4) onComplete(next);
  };

  return (
    <div className="mx-auto w-full max-w-xs space-y-4">
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[hsl(var(--pg-border))]"
          >
            {pin.length > i ? "●" : ""}
          </span>
        ))}
      </div>
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="lg"
            variant={key === "C" ? "outline" : "secondary"}
            className="h-16 text-xl"
            onClick={() => press(key)}
          >
            {key}
          </Button>
        ))}
      </div>
    </div>
  );
}
