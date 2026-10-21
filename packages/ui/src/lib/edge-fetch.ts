/**
 * Chiamate HTTP all'Edge per cassa e palmare, con limite di tempo e messaggi in italiano.
 *
 * Prima l'utente vedeva testi del browser come "signal is aborted without reason" (timeout)
 * o "Failed to fetch" (rete). Ora ogni errore dice cosa non va e cosa fare.
 *
 * Letture: 8 s. Scritture (POST/PUT/PATCH/DELETE): 20 s, perché includono stampe; se scadono
 * l'operazione potrebbe essere comunque avvenuta, e il messaggio lo dice (mai ripetere alla cieca).
 */

import { DEVICE_UNPAIRED_CODES, getDeviceToken, reportDeviceUnpaired, storeDeviceToken } from "./device-pairing.js";

const READ_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 20_000;

export type EdgeErrorKind = "TIMEOUT" | "NETWORK" | "OFFLINE" | "HTTP";

export class EdgeRequestError extends Error {
  constructor(
    message: string,
    readonly kind: EdgeErrorKind,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EdgeRequestError";
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** Traduce un errore qualsiasi (anche non dell'Edge) in un testo comprensibile per il personale. */
export function describeEdgeError(err: unknown): string {
  if (err instanceof EdgeRequestError) return err.message;
  const e = err as { name?: string; message?: string };
  const msg = e?.message ?? "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /signal is aborted|aborted/i.test(msg)) {
    return "La cassa non ha risposto in tempo. Controlla che il PC cassa sia acceso e che questo device sia sul Wi-Fi del locale, poi riprova.";
  }
  if (/failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(msg)) {
    return isOffline()
      ? "Questo device non è collegato al Wi-Fi. Ricollegalo e riprova."
      : "Impossibile raggiungere la cassa. Controlla che il PC cassa sia acceso e collegato alla rete.";
  }
  return msg || "Errore sconosciuto";
}

export interface EdgeRequestOptions extends RequestInit {
  /** Limite di tempo personalizzato (ms) */
  timeoutMs?: number;
}

export async function edgeRequest(baseUrl: string, path: string, options: EdgeRequestOptions = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD";
  const timeoutMs = options.timeoutMs ?? (isWrite ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
  const host = hostOf(baseUrl);

  if (isOffline()) {
    throw new EdgeRequestError("Questo device non è collegato al Wi-Fi. Ricollegalo e riprova.", "OFFLINE");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // Se il chiamante passa un suo segnale (es. pagina chiusa), lo rispettiamo
  const external = options.signal;
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });

  const { timeoutMs: _t, signal: _s, headers: rawHeaders, ...init } = options;
  const headers = new Headers(rawHeaders);
  const deviceToken = getDeviceToken();
  if (deviceToken && !headers.has("X-Device-Token")) headers.set("X-Device-Token", deviceToken);
  try {
    return await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      const secs = Math.round(timeoutMs / 1000);
      throw new EdgeRequestError(
        isWrite
          ? `La cassa non ha risposto entro ${secs} secondi. L'operazione potrebbe essere stata eseguita: controlla prima di ripetere. Se succede spesso, verifica il Wi-Fi e il PC cassa.`
          : `La cassa non risponde da ${secs} secondi. Controlla che il PC cassa sia acceso e che questo device sia sul Wi-Fi del locale.`,
        "TIMEOUT",
      );
    }
    if (external?.aborted) throw err;
    throw new EdgeRequestError(
      isOffline()
        ? "Questo device non è collegato al Wi-Fi. Ricollegalo e riprova."
        : `Impossibile raggiungere la cassa (${host}). Controlla che il PC cassa sia acceso e collegato alla rete; se l'indirizzo è cambiato, riapri l'app dall'indirizzo nuovo.`,
      "NETWORK",
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/** Errore HTTP dell'Edge → messaggio dell'Edge se presente, altrimenti uno chiaro per codice. */
export async function edgeHttpError(res: Response): Promise<EdgeRequestError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (body.code && DEVICE_UNPAIRED_CODES.has(body.code)) {
    reportDeviceUnpaired(body.code, body.error ?? "Dispositivo non abbinato: entra con il PIN.");
  }
  if (body.error) return new EdgeRequestError(body.error, "HTTP", res.status, body.code);
  const byStatus: Record<number, string> = {
    401: "Sessione scaduta: rientra con il tuo PIN.",
    403: "Operazione non consentita per questo utente.",
    404: "Elemento non trovato sulla cassa (forse è stato chiuso da un altro device): aggiorna la schermata.",
    409: "Operazione non possibile in questo momento (dato cambiato da un altro device): aggiorna e riprova.",
  };
  const msg =
    byStatus[res.status] ??
    (res.status >= 500
      ? `Errore interno della cassa (${res.status}). Riprova; se continua, invia la diagnostica.`
      : `La cassa ha risposto con errore ${res.status}.`);
  return new EdgeRequestError(msg, "HTTP", res.status, body.code);
}

/**
 * Abbina questo device all'Edge con il PIN di un operatore e salva il token.
 * Errori: PIN errato (code PIN_WRONG), troppi tentativi (PIN_BLOCKED), KDS con PIN cameriere (403).
 */
export async function pairDevice(
  baseUrl: string,
  input: { pin: string; deviceId: string; deviceKind: "handheld" | "cassa" | "kds"; deviceName?: string },
): Promise<{ id: string; name: string; kind: string }> {
  const res = await edgeRequest(baseUrl, "/api/devices/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await edgeHttpError(res);
  const data = (await res.json()) as { deviceToken: string; device: { id: string; name: string; kind: string } };
  storeDeviceToken(data.deviceToken);
  return data.device;
}
