import type { ProvHandshakeResponse } from "@pizzaguys/types";

const CLOUD_API_URL = process.env.CLOUD_API_URL ?? "http://localhost:4000";

export async function cloudHandshake(apiToken: string, edgeDeviceId: string) {
  const res = await fetch(`${CLOUD_API_URL}/api/v2/prov/handshake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiToken, edgeDeviceId, schemaVersion: 0 }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Handshake fallito (${res.status})`);
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
