/** Default usato in sviluppo quando JWT_SECRET non è impostata (pubblico: il repo è aperto). */
export const DEV_JWT_SECRET = "dev-secret-change-me";

/** Valori noti perché scritti nel codice o in .env.example: mai accettabili in produzione. */
const KNOWN_WEAK_SECRETS = new Set([DEV_JWT_SECRET, "change-me-in-production"]);

export const MIN_JWT_SECRET_LENGTH = 32;

export type JwtSecretCheck =
  | { ok: true; secret: string; warning?: string }
  | { ok: false; error: string };

/** Motivo per cui il segreto è debole, oppure null se va bene. */
function weakness(secret: string | undefined): string | null {
  if (secret === undefined || secret.trim() === "") return "JWT_SECRET non è impostata";
  if (KNOWN_WEAK_SECRETS.has(secret.trim())) return "JWT_SECRET usa un valore di default pubblico";
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return `JWT_SECRET è troppo corta (${secret.length} caratteri, minimo ${MIN_JWT_SECRET_LENGTH})`;
  }
  return null;
}

/**
 * In produzione un segreto mancante o debole blocca l'avvio; in sviluppo si
 * usa comunque (o il default) con un avviso nel log.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): JwtSecretCheck {
  const raw = env.JWT_SECRET;
  const problem = weakness(raw);
  if (!problem) return { ok: true, secret: raw! };

  if (env.NODE_ENV === "production") {
    return {
      ok: false,
      error:
        `${problem}: il Cloud non parte in produzione con un segreto debole o mancante. ` +
        `Impostare JWT_SECRET con una stringa casuale di almeno ${MIN_JWT_SECRET_LENGTH} caratteri ` +
        `(es. openssl rand -base64 48).`,
    };
  }

  const secret = raw && raw.trim() !== "" ? raw : DEV_JWT_SECRET;
  return { ok: true, secret, warning: `${problem}: accettata solo perché NODE_ENV non è production.` };
}
