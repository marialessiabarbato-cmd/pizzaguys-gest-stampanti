import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@pizzaguys/ui";
import { useMemo, useState } from "react";
import { edgeApi } from "../lib/api";

interface BillLine {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
}

interface AnalyticCheck {
  id: string;
  label: string;
  lineIds: string[];
  total: number;
  paid: boolean;
}

interface TableBill {
  tableId: string;
  lines: BillLine[];
  analyticSplit?: {
    checks: AnalyticCheck[];
    unassignedLineIds: string[];
    allAssigned: boolean;
  };
}

function DraggableLine({ line }: { line: BillLine }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: line.id,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="mb-2 cursor-grab rounded border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-2 text-sm active:cursor-grabbing"
    >
      <div className="font-medium">
        {line.quantity}× {line.name}
      </div>
      <div className="text-xs tabular-nums text-[hsl(var(--pg-muted-foreground))]">
        € {line.lineTotal.toFixed(2)}
      </div>
    </div>
  );
}

function DropColumn({
  id,
  title,
  lines,
  total,
  paid,
  onPay,
}: {
  id: string;
  title: string;
  lines: BillLine[];
  total?: number;
  paid?: boolean;
  onPay?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[120px] min-w-[140px] flex-1 flex-col rounded-lg border-2 p-2 ${
        isOver ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-muted))]/40" : "border-[hsl(var(--pg-border))]"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <h3 className="text-xs font-bold uppercase">{title}</h3>
        {total != null && (
          <span className="text-xs font-medium tabular-nums">€ {total.toFixed(2)}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.map((line) => (
          <DraggableLine key={line.id} line={line} />
        ))}
        {lines.length === 0 && (
          <p className="text-center text-xs text-[hsl(var(--pg-muted-foreground))]">Trascina qui</p>
        )}
      </div>
      {onPay && !paid && lines.length > 0 && (
        <Button className="mt-2 h-10 w-full text-xs" onClick={onPay}>
          Paga
        </Button>
      )}
      {paid && <p className="mt-2 text-center text-xs text-green-600">Pagato ✓</p>}
    </div>
  );
}

export function AnalyticSplitPanel({
  bill,
  onUpdated,
  onPayCheck,
}: {
  bill: TableBill;
  onUpdated: () => void;
  onPayCheck: (checkId: string, amount: number) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const lineMap = useMemo(() => new Map(bill.lines.map((l) => [l.id, l])), [bill.lines]);
  const split = bill.analyticSplit;

  const columns = useMemo(() => {
    if (!split) return null;
    const unassigned = split.unassignedLineIds
      .map((id) => lineMap.get(id))
      .filter((l): l is BillLine => l != null);
    const checks = split.checks.map((c) => ({
      ...c,
      lines: c.lineIds.map((id) => lineMap.get(id)).filter((l): l is BillLine => l != null),
    }));
    return { unassigned, checks };
  }, [split, lineMap]);

  const saveAssignments = async (checks: Array<{ id: string; label: string; lineIds: string[] }>) => {
    setSaving(true);
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${bill.tableId}/split/analytic`,
        { method: "POST", body: JSON.stringify({ checks }) },
      );
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!split || !event.over) return;

    const lineId = String(event.active.id);
    const targetId = String(event.over.id);

    const checks = split.checks.map((c) => ({
      id: c.id,
      label: c.label,
      lineIds: c.lineIds.filter((id) => id !== lineId),
    }));

    if (targetId !== "unassigned") {
      const target = checks.find((c) => c.id === targetId);
      if (target) target.lineIds.push(lineId);
    }

    void saveAssignments(checks);
  };

  const startSplit = async (checkCount: number) => {
    setSaving(true);
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${bill.tableId}/split/analytic`,
        { method: "POST", body: JSON.stringify({ checkCount }) },
      );
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  if (!split) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Dividi il conto assegnando le righe a più conti.
        </p>
        <div className="flex gap-2">
          {[2, 3, 4].map((n) => (
            <Button
              key={n}
              variant="outline"
              className="flex-1"
              disabled={saving || bill.lines.length === 0}
              onClick={() => void startSplit(n)}
            >
              {n} conti
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (!columns) return null;

  const activeLine = activeId ? lineMap.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2 overflow-x-auto pb-2">
        <DropColumn id="unassigned" title="Non assegnato" lines={columns.unassigned} />
        {columns.checks.map((check) => (
          <DropColumn
            key={check.id}
            id={check.id}
            title={check.label}
            lines={check.lines}
            total={check.total}
            paid={check.paid}
            onPay={
              check.paid || check.lines.length === 0
                ? undefined
                : () => onPayCheck(check.id, check.total)
            }
          />
        ))}
      </div>
      {saving && (
        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">Salvataggio...</p>
      )}
      <DragOverlay>
        {activeLine ? <DraggableLine line={activeLine} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
