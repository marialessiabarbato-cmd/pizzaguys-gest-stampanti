import { Button } from "@pizzaguys/ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", ".", "0", "⌫"];

function formatAmount(value: string): string {
  if (!value) return "0,00";
  const parts = value.split(".");
  const intPart = parts[0] || "0";
  const decPart = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  return `${intPart},${decPart}`;
}

export function PaymentPad({
  amount,
  onChange,
  total,
}: {
  amount: string;
  onChange: (amount: string) => void;
  total: number;
}) {
  const numericAmount = Number.parseFloat(amount || "0");
  const change = Math.max(0, Math.round((numericAmount - total) * 100) / 100);

  const press = (key: string) => {
    if (key === "C") {
      onChange("");
      return;
    }
    if (key === "⌫") {
      onChange(amount.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (amount.includes(".")) return;
      onChange(amount ? `${amount}.` : "0.");
      return;
    }
    if (amount.includes(".")) {
      const [, dec] = amount.split(".");
      if (dec && dec.length >= 2) return;
    }
    if (!amount.includes(".") && amount.replace(/^0+/, "").length >= 6) return;
    onChange(amount + key);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-[hsl(var(--pg-muted))] p-4 text-center">
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Ricevuto</p>
        <p className="text-3xl font-bold tabular-nums">€ {formatAmount(amount)}</p>
      </div>
      <div className="rounded-lg border-2 border-[hsl(var(--pg-primary))] p-4 text-center">
        <p className="text-sm font-medium text-[hsl(var(--pg-muted-foreground))]">RESTO</p>
        <p className="font-bold tabular-nums text-[36pt] leading-tight">
          € {change.toFixed(2).replace(".", ",")}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="lg"
            variant={key === "C" ? "outline" : "secondary"}
            className="h-14 min-h-[48px] text-xl"
            onClick={() => press(key)}
          >
            {key}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function parsePaymentAmount(amount: string): number {
  return Math.round(Number.parseFloat(amount || "0") * 100) / 100;
}
