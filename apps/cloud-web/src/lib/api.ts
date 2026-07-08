const API_URL = process.env.NEXT_PUBLIC_CLOUD_API_URL ?? "http://localhost:4000";
const API_TIMEOUT_MS = 10_000;

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
}

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
  const hasBody = options.body != null && options.body !== "";
  const headers = new Headers(options.headers);
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    const onLogin = window.location.pathname.startsWith("/login");
    if (!onLogin) {
      clearToken();
      window.location.replace("/login");
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const hasBody = options.body != null && options.body !== "";
  const headers = new Headers(options.headers);
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetchWithTimeout(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    const onLogin = window.location.pathname.startsWith("/login");
    if (!onLogin) {
      clearToken();
      window.location.replace("/login");
    }
  }

  return res;
}

export async function apiText(path: string, options: RequestInit = {}): Promise<string> {
  const res = await authFetch(path, options);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }
  return res.text();
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const res = await authFetch(path, options);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }
  return res.blob();
}

export { API_URL };
