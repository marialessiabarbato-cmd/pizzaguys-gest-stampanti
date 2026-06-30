import type { ReactNode } from "react";
import { Button } from "@pizzaguys/ui";
import type { LiveTable, Operator } from "../lib/types";

export function OrderHeader({
  table,
  operator,
  backLabel,
  onBack,
  right,
}: {
  table: LiveTable;
  operator: Operator;
  backLabel: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] p-4">
      <Button variant="ghost" className="min-h-12" onClick={onBack}>
        {backLabel}
      </Button>
      <div className="text-center">
        <h1 className="text-lg font-bold">{table.label}</h1>
        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
          {table.guests ?? table.defaultGuests} coperti
        </p>
      </div>
      <div className="flex min-w-[72px] items-center justify-end gap-2 text-sm">
        {right ?? <span>{operator.firstName}</span>}
      </div>
    </header>
  );
}
