import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const openClients = new Set<postgres.Sql>();

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  openClients.add(client);
  return drizzle(client, { schema });
}

/**
 * Chiude le connessioni aperte con `createDb`. Gli script (seed, patch) la chiamano alla fine:
 * senza, il pool tiene vivo il processo e il comando resta appeso (T13).
 */
export async function closeAllDb() {
  const clients = [...openClients];
  openClients.clear();
  await Promise.all(clients.map((c) => c.end({ timeout: 5 })));
}

export type Database = ReturnType<typeof createDb>;
