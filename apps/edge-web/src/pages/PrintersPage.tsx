import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";

interface Printer {
  id: string;
  name: string;
  workCenter: string;
  host: string;
  port: number;
  enabled: boolean;
}

export function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [message, setMessage] = useState("");

  const load = () => edgeApi<Printer[]>("/api/printers").then(setPrinters);

  useEffect(() => {
    void load();
  }, []);

  const testPrint = async (id: string) => {
    const res = await edgeApi<{ success: boolean; filePath?: string; error?: string }>(
      `/api/printers/${id}/test`,
      { method: "POST" },
    );
    setMessage(res.success ? `Mock stampato: ${res.filePath}` : res.error ?? "Errore");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stampanti</h1>
      {message && <p className="text-sm">{message}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {printers.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-[hsl(var(--pg-muted-foreground))]">
                Centro: {p.workCenter} · {p.host}:{p.port}
              </p>
              <Button onClick={() => void testPrint(p.id)}>Test stampa mock</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
