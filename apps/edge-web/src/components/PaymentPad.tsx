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
    <div className="flex min-h-0 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <div className="rounded-lg bg-[hsl(var(--pg-muted))] px-3 py-2 text-center">
          <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Ricevuto
          </p>
          <p className="text-xl font-bold tabular-nums leading-tight">€ {formatAmount(amount)}</p>
        </div>
        <div className="rounded-lg border-2 border-[hsl(var(--pg-primary))] px-3 py-2 text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Resto
          </p>
          <p className="text-xl font-bold tabular-nums leading-tight text-[hsl(var(--pg-primary))]">
            € {change.toFixed(2).replace(".", ",")}
          </p>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5 content-start">
        {KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="lg"
            variant={key === "C" ? "outline" : "secondary"}
            className="h-11 min-h-11 text-lg"
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
