"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    void api("/api/v2/auth/me")
      .then(() => setReady(true))
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
      </main>
    );
  }
  return children;
}
