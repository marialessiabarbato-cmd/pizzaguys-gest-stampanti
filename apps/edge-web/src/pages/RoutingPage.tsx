import { Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
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

  useEffect(() => {
    void edgeApi<{ snapshot: { categories: Category[] } }>("/api/menu").then((m) => {
      setCategories(m.snapshot?.categories ?? []);
    });
    void edgeApi<Routing[]>("/api/category-routing").then(setRouting);
  }, []);

  const getCenter = (categoryId: string) =>
    routing.find((r) => r.categoryId === categoryId)?.workCenter ?? "PIZZERIA";

  const save = async (categoryId: string, workCenter: string) => {
    await edgeApi("/api/category-routing", {
      method: "PUT",
      body: JSON.stringify({ categoryId, workCenter }),
    });
    setRouting((prev) => {
      const rest = prev.filter((r) => r.categoryId !== categoryId);
      return [...rest, { categoryId, workCenter }];
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Routing categorie → centri</h1>
      <Card>
        <CardHeader>
          <CardTitle>Assegnazione stampa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna categoria — verifica il provisioning.
            </p>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 rounded border border-[hsl(var(--pg-border))] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.colorHex }} />
                  <span>{catName(c.name)}</span>
                </div>
                <select
                  className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-1 text-sm"
                  value={getCenter(c.id)}
                  onChange={(e) => void save(c.id, e.target.value)}
                >
                  {CENTERS.map((center) => (
                    <option key={center} value={center}>{center}</option>
                  ))}
                </select>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
