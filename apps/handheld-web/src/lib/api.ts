const EDGE_API = import.meta.env.VITE_EDGE_API_URL ?? "http://localhost:4100";

export async function edgeApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${EDGE_API}${path}`, {
    ...options,
    headers: (() => {
      const headers = new Headers(options.headers);
      if (options.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return headers;
    })(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }
  return res.json() as Promise<T>;
}
