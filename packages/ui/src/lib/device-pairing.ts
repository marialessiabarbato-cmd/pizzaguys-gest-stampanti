/**
 * Abbinamento del device con l'Edge (lato app). Il token si ottiene una volta con il PIN
 * (`pairDevice`) e resta salvato nel browser; `edgeRequest` e il WebSocket lo inviano da soli.
 * Se l'Edge risponde DEVICE_NOT_PAIRED / DEVICE_REVOKED il token viene cancellato e le app
 * tornano alla schermata PIN (`onDeviceUnpaired`).
 */

const STORAGE_KEY = "pg-device-token";
let memoryToken: string | null = null;

const tokenListeners = new Set<() => void>();
const unpairedListeners = new Set<(info: { code: string; message: string }) => void>();

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function setToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage non disponibile: resta in memoria */
  }
  for (const l of [...tokenListeners]) l();
}

export function clearDeviceToken() {
  if (getDeviceToken() === null) return;
  setToken(null);
}

/** Avvisa quando il token cambia (abbinamento o revoca): il WebSocket si ricollega. */
export function onDeviceTokenChange(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

export function onDeviceUnpaired(listener: (info: { code: string; message: string }) => void): () => void {
  unpairedListeners.add(listener);
  return () => unpairedListeners.delete(listener);
}

/** Chiamato quando l'Edge rifiuta il device: cancella il token e avvisa le app. */
export function reportDeviceUnpaired(code: string, message: string) {
  clearDeviceToken();
  for (const l of [...unpairedListeners]) l({ code, message });
}

export const DEVICE_UNPAIRED_CODES = new Set(["DEVICE_NOT_PAIRED", "DEVICE_REVOKED"]);

/** Salva il token ricevuto dall'Edge dopo l'abbinamento. */
export function storeDeviceToken(token: string) {
  setToken(token);
}
