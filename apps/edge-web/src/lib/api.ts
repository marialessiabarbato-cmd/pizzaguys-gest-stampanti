import { edgeHttpError, edgeRequest, resolveEdgeUrl } from "@pizzaguys/ui";

const EDGE_API = resolveEdgeUrl(import.meta.env.VITE_EDGE_API_URL, "http://localhost:4100");

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
  const res = await edgeRequest(EDGE_API, path, { ...options, headers });
  if (!res.ok) {
    const err = await edgeHttpError(res);
    if (err.code === "ADMIN_REQUIRED") adminRequiredHandler?.();
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function edgeApiDownload(path: string, filename: string): Promise<void> {
  const headers: HeadersInit = operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {};
  const res = await edgeRequest(EDGE_API, path, { headers, timeoutMs: 30_000 });
  if (!res.ok) throw await edgeHttpError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { EDGE_API };
