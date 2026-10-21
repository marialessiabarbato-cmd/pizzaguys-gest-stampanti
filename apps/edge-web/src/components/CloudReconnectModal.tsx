import { Button, describeEdgeError } from "@pizzaguys/ui";
import { useState } from "react";
import { edgeApi } from "../lib/api";
import { OffCanvas, offCanvasFooterClass } from "./OffCanvas";

/**
 * Ricollega al Cloud un Edge già attivo (token della sede rigenerato o revocato).
 * Solo Admin di sede: l'Edge lo verifica (ADMIN_REQUIRED). Tavoli e incassi restano.
 */
export function CloudReconnectModal({ onClose, onDone }: { onClose: () => void; onDone: (locationName?: string) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await edgeApi<{ locationName?: string }>("/api/provision", {
        method: "POST",
        body: JSON.stringify({ apiToken: token.trim() }),
      });
      onDone(res.locationName);
    } catch (e) {
      setError(describeEdgeError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <OffCanvas onClose={loading ? undefined : onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <h2 className="text-lg font-bold">Ricollega al Cloud</h2>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Il Cloud non accetta più il token di questa cassa (di solito perché è stato rigenerato dal Cloud Admin).
          Incolla il token attuale della sede: Cloud Admin → Sedi → la tua sede → Token API.
        </p>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Tavoli aperti, incassi e chiusure restano su questa cassa; i dati in coda verranno inviati appena collegata.
        </p>
        <p className="text-sm text-amber-800">
          Attenzione: se lo stesso token è usato da un'altra cassa della stessa sede, le due casse non condividono i tavoli.
        </p>
        <input
          className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-3 font-mono text-sm"
          placeholder="pg_…"
          value={token}
          autoFocus
          onChange={(e) => setToken(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className={offCanvasFooterClass}>
        <Button variant="outline" className="flex-1" disabled={loading} onClick={onClose}>
          Annulla
        </Button>
        <Button className="flex-1" disabled={loading || token.trim().length < 32} onClick={() => void submit()}>
          {loading ? "Collegamento…" : "Ricollega"}
        </Button>
      </div>
    </OffCanvas>
  );
}
