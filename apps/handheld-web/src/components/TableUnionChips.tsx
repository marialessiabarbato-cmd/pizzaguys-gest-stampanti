import type { LiveTable } from "../lib/types";
import { formatTableLabel, unionMembers } from "../lib/table-display";

/** Chip dei tavoli nel gruppo unito */
export function TableUnionChips({
  host,
  allTables,
  size = "md",
  tone = "amber",
}: {
  host: LiveTable;
  allTables: LiveTable[];
  size?: "sm" | "md";
  tone?: "amber" | "neutral";
}) {
  const members = unionMembers(host, allTables);
  if (members.length < 2) return null;

  const chip =
    tone === "neutral"
      ? size === "sm"
        ? "rounded-md bg-[hsl(var(--pg-muted))] px-1.5 py-px text-[9px] font-semibold text-[hsl(var(--pg-foreground))]"
        : "rounded-full bg-[hsl(var(--pg-muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--pg-foreground))]"
      : size === "sm"
        ? "rounded-md bg-amber-400/90 px-1.5 py-px text-[9px] font-bold text-amber-950"
        : "rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950 shadow-sm";

  const plusClass =
    tone === "neutral"
      ? `font-medium text-[hsl(var(--pg-muted-foreground))] ${size === "sm" ? "text-[10px]" : "text-sm"}`
      : `font-bold text-amber-200 ${size === "sm" ? "text-[10px]" : "text-sm"}`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {members.map((t, i) => (
        <span key={t.id} className="flex items-center gap-1">
          {i > 0 && <span className={plusClass}>+</span>}
          <span className={chip}>{formatTableLabel(t.label)}</span>
        </span>
      ))}
    </div>
  );
}
