import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "@/lib/api";

export function ProvisionPage({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const provision = async () => {
    setLoading(true);
    setError("");
    try {
      await edgeApi("/api/provision", {
        method: "POST",
        body: JSON.stringify({ apiToken: token }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore provisioning");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Provisioning sede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Inserisci il token API generato dal Cloud Admin per questa sede.
            Verrà eseguito l&apos;handshake HTTPS con il cloud e il menu verrà scaricato localmente.
          </p>
          <input
            className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-3 font-mono text-sm"
            placeholder="Token API sede (64 caratteri)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button className="w-full" disabled={loading || token.length < 32} onClick={() => void provision()}>
            {loading ? "Connessione al cloud..." : "Attiva sede"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
