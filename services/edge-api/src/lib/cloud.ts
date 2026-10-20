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

export async function cloudHandshake(apiToken: string, edgeDeviceId: string) {
  let res: Response;
  try {
    res = await fetch(`${CLOUD_API_URL}/api/v2/prov/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiToken, edgeDeviceId, schemaVersion: 0 }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Cloud non raggiungibile (${CLOUD_API_URL}): ${describeCloudError(err)}`);
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      err.error
        ? `Il Cloud (${CLOUD_API_URL}) ha risposto ${res.status}: ${err.error}`
        : `Il Cloud (${CLOUD_API_URL}) ha risposto ${res.status} al collegamento`,
    );
  }

  return res.json() as Promise<ProvHandshakeResponse>;
}

export async function cloudHeartbeat(apiToken: string, schemaVersion: number) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiToken, schemaVersion }),
  });

  if (!res.ok) return null;
  return res.json() as Promise<{
    cloudSchemaVersion: number;
    desyncBuilds: number;
    healthStatus: string;
  }>;
}

export async function cloudDelta(
  locationId: string,
  sinceVersion: number,
  apiToken: string,
) {
  const url = new URL(`${CLOUD_API_URL}/api/v2/sync/delta`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("sinceVersion", String(sinceVersion));
  url.searchParams.set("apiToken", apiToken);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return res.json() as Promise<{ schemaVersion: number; delta: unknown }>;
}

export async function cloudDailyClosure(apiToken: string, payload: unknown) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/daily-closure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sync chiusura fallita (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; receivedAt: string }>;
}

export async function cloudCashSessionSync(apiToken: string, payload: unknown) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/cash-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sync sessione di cassa fallita (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; receivedAt: string }>;
}

export async function cloudInvoiceSync(
  apiToken: string,
  payload: {
    locationId: string;
    edgeInvoiceId: string;
    invoice: unknown;
  },
) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sync fattura fallita (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; receivedAt: string; cloudStatus: string }>;
}

export async function cloudReportIssue(
  apiToken: string,
  payload: { message: string; appName?: string; operatorName?: string },
) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/support/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Invio segnalazione fallito (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; mode: string }>;
}

export async function cloudCustomerProfileSync(
  apiToken: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/invoice-customer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sync cliente fallita (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; receivedAt: string }>;
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
  const res = await fetch(`${CLOUD_API_URL}/api/v2/sync/staff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sync operatore fallita (${res.status})`);
  }

  return res.json() as Promise<{ ok: boolean; receivedAt: string }>;
}
