/** Parte di Web Crypto usata qui: il package non include le lib DOM. */
interface WebCrypto {
  randomUUID?: () => string;
  getRandomValues: (array: Uint8Array) => Uint8Array;
}

/**
 * UUID v4 anche fuori da un contesto sicuro: `crypto.randomUUID` esiste solo su HTTPS o
 * localhost, mentre i palmari aprono le app dell'Edge in HTTP sulla rete del locale
 * (es. `http://192.168.1.20:5174`). `crypto.getRandomValues` è disponibile ovunque.
 */
export function randomId(): string {
  const webCrypto = (globalThis as unknown as { crypto: WebCrypto }).crypto;
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
