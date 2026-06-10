const API_URL = process.env.NEXT_PUBLIC_CLOUD_API_URL ?? "http://localhost:4000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pg_token");
}

export function setToken(token: string) {
  localStorage.setItem("pg_token", token);
}

export function clearToken() {
  localStorage.removeItem("pg_token");
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }

  return res.json() as Promise<T>;
}
