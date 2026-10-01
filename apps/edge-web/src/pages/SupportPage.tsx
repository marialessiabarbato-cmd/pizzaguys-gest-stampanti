import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "@/lib/api";

export function SupportPage() {
  const [message, setMessage] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setResult("");
    try {
      await edgeApi("/api/support/report", {
        method: "POST",
        body: JSON.stringify({
          message: message.trim(),
          operatorName: operatorName.trim() || undefined,
          appName: "cassa",
        }),
      });
      setResult("Segnalazione inviata.");
      setMessage("");
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Invio fallito");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Segnala un problema</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Descrivi cosa è successo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            className="h-11 w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 text-sm"
            placeholder="Il tuo nome (opzionale)"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
          />
          <textarea
            className="min-h-[140px] w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] p-3 text-sm"
            placeholder="Cosa non ha funzionato? Più dettagli dai, più è facile risolvere."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button className="w-full" disabled={sending || !message.trim()} onClick={() => void send()}>
            {sending ? "Invio..." : "Invia segnalazione"}
          </Button>
          {result && <p className="text-sm">{result}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
