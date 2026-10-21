import { Button, Card, CardContent, CardHeader, CardTitle, describeEdgeError, getStableDeviceId, pairDevice } from "@pizzaguys/ui";
import { useState } from "react";

/**
 * Abbinamento del KDS alla cassa: una volta sola, con il PIN di un cassiere o dell'Admin.
 * Il nome aiuta a riconoscerlo nell'elenco dispositivi (es. "KDS Forno").
 */
export function KdsPairing({ edgeUrl, reason, onPaired }: { edgeUrl: string; reason?: string; onPaired: () => void }) {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await pairDevice(edgeUrl, {
        pin,
        deviceId: getStableDeviceId("kds"),
        deviceKind: "kds",
        deviceName: name.trim() || undefined,
      });
      onPaired();
    } catch (e) {
      setError(describeEdgeError(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-3 text-lg";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--pg-background))] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Abbina questo KDS alla cassa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {reason ?? "Serve una volta sola."} Inserisci il PIN di un cassiere o dell&apos;Admin.
          </p>
          <input
            className={input}
            placeholder="Nome (es. KDS Forno) — facoltativo"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={`${input} tracking-[0.5em]`}
            placeholder="PIN"
            inputMode="numeric"
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.length === 4 && !busy) void submit();
            }}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={busy || pin.length !== 4} onClick={() => void submit()}>
            {busy ? "Abbinamento…" : "Abbina"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
