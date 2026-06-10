import type { CartLine } from "./types";

const DB_NAME = "pizzaguys-handheld";
const STORE = "drafts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "tableId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(tableId: string, cart: CartLine[], operatorId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ tableId, cart, operatorId, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDraft(tableId: string): Promise<{ cart: CartLine[]; operatorId: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(tableId);
    req.onsuccess = () => {
      const row = req.result as { cart: CartLine[]; operatorId: string } | undefined;
      resolve(row ? { cart: row.cart, operatorId: row.operatorId } : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearDraft(tableId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(tableId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
