import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";

interface Category {
  id: string;
  name: Record<string, string>;
  colorHex: string;
}

interface Routing {
  categoryId: string;
  workCenter: string;
}

const CENTERS = ["CUCINA", "PIZZERIA", "BAR", "CHEF"] as const;

function catName(name: Record<string, string>) {
  return name.it ?? name.en ?? Object.values(name)[0] ?? "";
}

export function RoutingPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [routing, setRouting] = useState<Routing[]>([]);
  const [draftByCategory, setDraftByCategory] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void edgeApi<{ snapshot: { categories: Category[] } }>("/api/menu").then((m) => {
      setCategories(m.snapshot?.categories ?? []);
    });
    void edgeApi<Routing[]>("/api/category-routing").then((rows) => {
      setRouting(rows);
      const nextDraft: Record<string, string> = {};
      for (const row of rows) nextDraft[row.categoryId] = row.workCenter;
      setDraftByCategory(nextDraft);
    });
  }, []);

  const getCenter = (categoryId: string) =>
    routing.find((r) => r.categoryId === categoryId)?.workCenter ?? "PIZZERIA";

  const getDraftCenter = (categoryId: string) => draftByCategory[categoryId] ?? getCenter(categoryId);

  const hasChanges = categories.some((c) => getDraftCenter(c.id) !== getCenter(c.id));

  const saveAll = async () => {
    if (!hasChanges) return;
    setSavingAll(true);
    setMessage("");
    try {
      const changed = categories
        .map((c) => ({
          categoryId: c.id,
          workCenter: getDraftCenter(c.id),
          previous: getCenter(c.id),
        }))
        .filter((row) => row.workCenter !== row.previous);

      await Promise.all(
        changed.map((row) =>
          edgeApi("/api/category-routing", {
            method: "PUT",
            body: JSON.stringify({ categoryId: row.categoryId, workCenter: row.workCenter }),
          }),
        ),
      );

      setRouting((prev) => {
        const map = new Map(prev.map((r) => [r.categoryId, r.workCenter]));
        for (const row of changed) map.set(row.categoryId, row.workCenter);
        return Array.from(map.entries()).map(([categoryId, workCenter]) => ({ categoryId, workCenter }));
      });

      setMessage("Routing aggiornato");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore salvataggio routing");
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Assegnazione stampa</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Assegna ogni categoria al centro di produzione per la stampa comande.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => void saveAll()} disabled={!hasChanges || savingAll}>
            {savingAll ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      </div>

      {message && (
        <p className="rounded-md bg-[hsl(var(--pg-muted))] px-3 py-2 text-sm">{message}</p>
      )}

      <Card className="overflow-hidden border-[hsl(var(--pg-border))] shadow-sm">
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna categoria disponibile. Verifica il provisioning.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[hsl(var(--pg-muted))]/50 text-xs uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Categoria</th>
                    <th className="px-4 py-3 text-right font-semibold">Centro assegnato</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="transition hover:bg-[hsl(var(--pg-muted))]/20">
                      <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.colorHex }} />
                          <span className="font-medium">{catName(c.name)}</span>
                        </div>
                      </td>
                      <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3 text-right">
                        <select
                          className="h-9 min-w-[180px] rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                          value={getDraftCenter(c.id)}
                          onChange={(e) =>
                            setDraftByCategory((prev) => ({ ...prev, [c.id]: e.target.value }))
                          }
                          disabled={savingAll}
                        >
                          {CENTERS.map((center) => (
                            <option key={center} value={center}>
                              {center}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
