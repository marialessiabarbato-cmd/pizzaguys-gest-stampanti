import { edgeHttpError, edgeRequest, resolveEdgeUrl } from "@pizzaguys/ui";

const EDGE_API = resolveEdgeUrl(import.meta.env.VITE_EDGE_API_URL, "http://localhost:4100");

/** Token della sessione operatore (da verify-pin): richiesto dalle modifiche riservate all'Admin di sede. */
let operatorToken: string | null = null;

export function setOperatorToken(token: string | null) {
  operatorToken = token;
}

export async function edgeApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await edgeRequest(EDGE_API, path, {
    ...options,
    headers: (() => {
      const headers = new Headers(options.headers);
      if (options.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (operatorToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${operatorToken}`);
      }
      return headers;
    })(),
  });
  if (!res.ok) throw await edgeHttpError(res);
  return res.json() as Promise<T>;
}

export { EDGE_API };
