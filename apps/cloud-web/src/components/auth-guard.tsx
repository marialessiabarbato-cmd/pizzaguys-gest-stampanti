"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    void api("/api/v2/auth/me")
      .then(() => setReady(true))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        const isNetwork =
          err instanceof DOMException && err.name === "AbortError"
            ? true
            : /fetch|network|abort/i.test(message);

        if (isNetwork) {
          setError(
            "Cloud API non raggiungibile (porta 4000). Avvia lo stack con pnpm dev e riprova.",
          );
          return;
        }

        clearToken();
        router.replace("/login");
      });
  }, [router]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => window.location.reload()}
        >
          Riprova
        </button>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
      </main>
    );
  }
  return children;
}
