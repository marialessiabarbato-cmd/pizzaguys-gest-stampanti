const EDGE_API = import.meta.env.VITE_EDGE_API_URL ?? "http://localhost:4100";
const DEFAULT_TIMEOUT_MS = 8_000;

/** Token della sessione operatore (da verify-pin): richiesto dalle route di configurazione. */
let operatorToken: string | null = null;

export function setOperatorToken(token: string | null) {
  operatorToken = token;
}

/** Chiamato quando l'Edge rifiuta una modifica per sessione Admin assente o scaduta. */
let adminRequiredHandler: (() => void) | null = null;

export function onAdminRequired(handler: (() => void) | null) {
  adminRequiredHandler = handler;
}

export async function edgeApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (operatorToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${operatorToken}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const res = await fetch(`${EDGE_API}${path}`, {
    ...options,
    headers,
    signal: options.signal ?? controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (err.code === "ADMIN_REQUIRED") adminRequiredHandler?.();
    throw new Error(err.error ?? `Errore ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function edgeApiDownload(path: string, filename: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const headers: HeadersInit = operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {};
  const res = await fetch(`${EDGE_API}${path}`, { headers, signal: controller.signal }).finally(() =>
    clearTimeout(timeout),
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Errore ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { EDGE_API };
