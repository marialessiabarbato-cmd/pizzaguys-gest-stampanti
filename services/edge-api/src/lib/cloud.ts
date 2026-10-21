import type { ProvHandshakeResponse } from "@pizzaguys/types";

const CLOUD_API_URL = process.env.CLOUD_API_URL ?? "http://localhost:4000";

/** Spiega in italiano perché una chiamata al Cloud è fallita (invece del generico "fetch failed"). */
export function describeCloudError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? "";
  const detail = e?.cause?.message ?? e?.message ?? "errore sconosciuto";
  const reasons: Record<string, string> = {
    ECONNREFUSED: "connessione rifiutata: il Cloud non è acceso o la porta è bloccata dal firewall",
    ENOTFOUND: "indirizzo non trovato: controlla CLOUD_API_URL in edge.env (nome o IP sbagliato, o nessun DNS)",
    EAI_AGAIN: "indirizzo non risolvibile: il PC non ha internet o DNS",
    ETIMEDOUT: "nessuna risposta (timeout): rete diversa dal Cloud o firewall che scarta i pacchetti",
    UND_ERR_CONNECT_TIMEOUT: "nessuna risposta (timeout): rete diversa dal Cloud o firewall che scarta i pacchetti",
    EHOSTUNREACH: "PC del Cloud non raggiungibile sulla rete (IP sbagliato o rete diversa)",
    ENETUNREACH: "rete non raggiungibile: il PC non è collegato alla stessa rete del Cloud",
    ECONNRESET: "connessione interrotta dal Cloud o da un antivirus/proxy",
    ERR_INVALID_URL: "CLOUD_API_URL non è un indirizzo valido (deve iniziare con http:// o https://)",
    CERT_HAS_EXPIRED: "certificato del Cloud scaduto",
    DEPTH_ZERO_SELF_SIGNED_CERT: "certificato del Cloud non attendibile",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "certificato del Cloud non attendibile",
  };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return "nessuna risposta (timeout): rete diversa dal Cloud o firewall che scarta i pacchetti";
  }
  if (e?.message === "Invalid URL") {
    return "CLOUD_API_URL non è un indirizzo valido (deve iniziare con http:// o https://)";
  }
  return reasons[code] ?? `${detail}${code ? ` (${code})` : ""}`;
}

/** Timeout di ogni chiamata al Cloud: un Cloud lento non deve bloccare la sincronizzazione. */
const CLOUD_TIMEOUT_MS = 10_000;

/** Errore di una chiamata al Cloud, con codice HTTP (se il Cloud ha risposto) e messaggio chiaro. */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly kind: "UNREACHABLE" | "UNAUTHORIZED" | "HTTP",
    readonly status?: number,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

/**
 * Chiamata al Cloud con timeout e messaggi in italiano.
 * - Cloud non raggiungibile → CloudError UNREACHABLE con il motivo (rete, DNS, firewall…)
 * - 401/403 → CloudError UNAUTHORIZED (token della sede non valido o rigenerato)
 * - altro codice non 2xx → CloudError HTTP con il messaggio del Cloud
 */
async function cloudRequest<T>(
  path: string,
  options: { method?: string; apiToken?: string; body?: unknown; what: string },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CLOUD_API_URL}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.apiToken ? { Authorization: `Bearer ${options.apiToken}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CloudError(
      `${options.what}: Cloud non raggiungibile (${CLOUD_API_URL}): ${describeCloudError(err)}`,
      "UNREACHABLE",
    );
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401 || res.status === 403) {
      throw new CloudError(
        `${options.what}: il Cloud ha rifiutato il token della sede (${res.status}${err.error ? `: ${err.error}` : ""}). ` +
          "Il token potrebbe essere stato rigenerato: ricollega la cassa con il token nuovo dal Cloud Admin.",
        "UNAUTHORIZED",
        res.status,
      );
    }
    throw new CloudError(
      `${options.what}: il Cloud ha risposto ${res.status}${err.error ? `: ${err.error}` : ""}`,
      "HTTP",
      res.status,
    );
  }

  return (await res.json()) as T;
}

export async function cloudHandshake(apiToken: string, edgeDeviceId: string) {
  return cloudRequest<ProvHandshakeResponse>("/api/v2/prov/handshake", {
    body: { apiToken, edgeDeviceId, schemaVersion: 0 },
    what: "Collegamento al Cloud",
  });
}

export async function cloudHeartbeat(apiToken: string, schemaVersion: number) {
  return cloudRequest<{
    cloudSchemaVersion: number;
    desyncBuilds: number;
    healthStatus: string;
  }>("/api/v2/sync/heartbeat", {
    apiToken,
    body: { apiToken, schemaVersion },
    what: "Heartbeat",
  });
}

export async function cloudDelta(locationId: string, sinceVersion: number, apiToken: string) {
  const qs = new URLSearchParams({ locationId, sinceVersion: String(sinceVersion) });
  // Il token viaggia nell'header, non nell'indirizzo (gli indirizzi finiscono nei log)
  return cloudRequest<{ schemaVersion: number; delta: unknown }>(`/api/v2/sync/delta?${qs}`, {
    apiToken,
    what: "Aggiornamento menu",
  });
}

export async function cloudDailyClosure(apiToken: string, payload: unknown) {
  return cloudRequest<{ ok: boolean; receivedAt: string }>("/api/v2/sync/daily-closure", {
    apiToken,
    body: payload,
    what: "Invio chiusura giornaliera",
  });
}

export async function cloudCashSessionSync(apiToken: string, payload: unknown) {
  return cloudRequest<{ ok: boolean; receivedAt: string }>("/api/v2/sync/cash-session", {
    apiToken,
    body: payload,
    what: "Invio sessione di cassa",
  });
}

export async function cloudInvoiceSync(
  apiToken: string,
  payload: {
    locationId: string;
    edgeInvoiceId: string;
    invoice: unknown;
  },
) {
  return cloudRequest<{ ok: boolean; receivedAt: string; cloudStatus: string }>("/api/v2/sync/invoice", {
    apiToken,
    body: payload,
    what: "Invio fattura",
  });
}

export async function cloudReportIssue(
  apiToken: string,
  payload: { message: string; appName?: string; operatorName?: string },
) {
  return cloudRequest<{ ok: boolean; mode: string }>("/api/v2/support/report", {
    apiToken,
    body: payload,
    what: "Invio segnalazione",
  });
}

export async function cloudCustomerProfileSync(apiToken: string, payload: Record<string, unknown>) {
  return cloudRequest<{ ok: boolean; receivedAt: string }>("/api/v2/sync/invoice-customer", {
    apiToken,
    body: payload,
    what: "Invio cliente",
  });
}

export async function cloudStaffSync(
  apiToken: string,
  payload: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: "USER_ADMIN" | "CASHIER" | "WAITER";
    pinHash: string;
    isActive: boolean;
  },
) {
  return cloudRequest<{ ok: boolean; receivedAt: string }>("/api/v2/sync/staff", {
    apiToken,
    body: payload,
    what: "Invio operatore",
  });
}
