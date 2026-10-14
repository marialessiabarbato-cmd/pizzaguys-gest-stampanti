const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * URL dell'Edge per le app del locale (cassa, palmare, KDS).
 * Se il valore configurato punta a localhost ma la pagina è aperta da un altro dispositivo
 * (es. smartphone su `http://192.168.1.20:5174`), usa l'host da cui è stata servita la pagina:
 * per il telefono "localhost" sarebbe il telefono stesso.
 */
export function resolveEdgeUrl(configured: string | undefined, fallback: string): string {
  const url = new URL(configured || fallback);
  if (typeof window === "undefined") return url.toString().replace(/\/$/, "");
  const pageHost = window.location.hostname;
  if (LOCAL_HOSTS.has(url.hostname) && !LOCAL_HOSTS.has(pageHost)) {
    url.hostname = pageHost;
  }
  return url.toString().replace(/\/$/, "");
}
