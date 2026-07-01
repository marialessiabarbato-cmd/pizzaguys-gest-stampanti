import type { LiveTable } from "../lib/types";
import { unionMembers } from "../lib/table-display";

/** Chip dei tavoli nel gruppo unito */
export function TableUnionChips({
  host,
  allTables,
  size = "md",
}: {
  host: LiveTable;
  allTables: LiveTable[];
  size?: "sm" | "md";
}) {
  const members = unionMembers(host, allTables);
  if (members.length < 2) return null;

  const chip =
    size === "sm"
      ? "rounded-md bg-amber-400/90 px-1.5 py-px text-[9px] font-bold text-amber-950"
      : "rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950 shadow-sm";

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {members.map((t, i) => (
        <span key={t.id} className="flex items-center gap-1">
          {i > 0 && (
            <span className={`font-bold text-amber-200 ${size === "sm" ? "text-[10px]" : "text-sm"}`}>
              +
            </span>
          )}
          <span className={chip}>{t.label}</span>
        </span>
      ))}
    </div>
  );
}
