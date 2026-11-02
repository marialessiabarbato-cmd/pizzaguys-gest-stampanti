import type { Socket } from "node:net";

/**
 * Stato di una stampante ESC/POS letto con i comandi in tempo reale DLE EOT
 * (Epson TM e compatibili). Le stampanti che non rispondono restano "sconosciuto":
 * in quel caso si stampa comunque, come prima.
 */
export type PrinterCondition =
  | "OK"
  | "PAPER_NEAR_END"
  | "PAPER_OUT"
  | "COVER_OPEN"
  | "ERROR"
  | "UNREACHABLE"
  | "UNKNOWN";

export interface PrinterStatus {
  condition: PrinterCondition;
  /** true se la stampante ha risposto ai comandi di stato. */
  supported: boolean;
  paperNearEnd: boolean;
  /** Messaggio leggibile per il personale. */
  message: string;
  checkedAt: string;
}

/** DLE EOT 2 (causa offline) + DLE EOT 4 (sensore carta). */
export const STATUS_REQUEST = Buffer.from([0x10, 0x04, 0x02, 0x10, 0x04, 0x04]);

/** Un byte di stato valido ha i bit 1 e 4 a 1, i bit 0 e 7 a 0. */
function isStatusByte(b: number): boolean {
  return (b & 0x93) === 0x12;
}

export const CONDITION_MESSAGES: Record<PrinterCondition, string> = {
  OK: "pronta",
  PAPER_NEAR_END: "carta in esaurimento",
  PAPER_OUT: "carta finita",
  COVER_OPEN: "coperchio aperto",
  ERROR: "stampante in errore (controlla taglierina o inceppamento)",
  UNREACHABLE: "non raggiungibile",
  UNKNOWN: "stato non disponibile",
};

/** Le condizioni con cui non ha senso mandare la stampa: andrebbe persa. */
export function isBlocking(condition: PrinterCondition): boolean {
  return (
    condition === "PAPER_OUT" ||
    condition === "COVER_OPEN" ||
    condition === "ERROR" ||
    condition === "UNREACHABLE"
  );
}

export function makeStatus(condition: PrinterCondition, supported: boolean, paperNearEnd = false): PrinterStatus {
  return {
    condition,
    supported,
    paperNearEnd,
    message: CONDITION_MESSAGES[condition],
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Interpreta le risposte a DLE EOT 2 e DLE EOT 4.
 * - EOT 2: bit 2 coperchio aperto, bit 5 stampa ferma per fine carta, bit 6 errore.
 * - EOT 4: bit 2-3 carta in esaurimento, bit 5-6 carta finita.
 */
export function parseStatusBytes(bytes: Buffer): PrinterStatus {
  const valid = [...bytes].filter(isStatusByte);
  if (valid.length < 2) return makeStatus("UNKNOWN", false);
  const [offline, paper] = valid as [number, number];
  const nearEnd = (paper & 0x0c) !== 0;
  if (offline & 0x04) return makeStatus("COVER_OPEN", true, nearEnd);
  if ((paper & 0x60) !== 0 || (offline & 0x20) !== 0) return makeStatus("PAPER_OUT", true, nearEnd);
  if (offline & 0x40) return makeStatus("ERROR", true, nearEnd);
  if (nearEnd) return makeStatus("PAPER_NEAR_END", true, true);
  return makeStatus("OK", true);
}

/**
 * Su un socket già connesso chiede lo stato e aspetta al massimo `timeoutMs`
 * le due risposte. Se non arrivano lo stato è UNKNOWN (stampante non compatibile).
 */
export function readStatusOnSocket(socket: Socket, timeoutMs: number): Promise<PrinterStatus> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.off("data", onData);
      resolve(parseStatusBytes(Buffer.concat(chunks)));
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      if ([...Buffer.concat(chunks)].filter(isStatusByte).length >= 2) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.on("data", onData);
    socket.write(STATUS_REQUEST);
  });
}
