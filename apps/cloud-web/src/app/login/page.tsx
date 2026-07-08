"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { loginInputClass } from "@/lib/cloud-admin-ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@pizzaguys.it");
  const [password, setPassword] = useState("PizzaGuys2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ token: string }>("/api/v2/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Cloud Hub — Accesso</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <input
              type="email"
              className={loginInputClass}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className={loginInputClass}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-[hsl(var(--pg-danger))]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Accesso..." : "Accedi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
