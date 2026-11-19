import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isCompleteResponse, parseResponseXml, type RtResponse } from "./response.js";

export interface FolderTransportConfig {
  /** Cartella di ascolto del Server di Stampa (es. C:\AXONFPID_PRO_V7\CARTELLA_STAMPA) */
  dir: string;
  /** Estensione ascoltata da axonFPiD. Default TXT. */
  extension?: string;
  /** Attesa massima della risposta. Deve superare il timeout RT di axonFPiD (15 s). Default 25 s. */
  timeoutMs?: number;
  pollMs?: number;
}

export type SubmitResult =
  | { kind: "response"; fileId: string; response: RtResponse }
  | { kind: "timeout"; fileId: string };

function newFileId(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `HUBBI_${stamp}_${randomBytes(3).toString("hex").toUpperCase()}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Consegna un documento ad axonFPiD scrivendo un file nella cartella di ascolto
 * e attende il Response XML. Il file viene scritto con estensione temporanea e
 * poi rinominato, così axonFPiD non lo legge mai a metà.
 *
 * Dopo un timeout NON si riprova da soli: il file potrebbe essere ancora in
 * coda e stampare più tardi, con il rischio di uno scontrino doppio.
 */
export class FolderTransport {
  private readonly extension: string;
  private readonly timeoutMs: number;
  private readonly pollMs: number;

  constructor(private readonly config: FolderTransportConfig) {
    this.extension = (config.extension ?? "TXT").replace(/^\./, "");
    this.timeoutMs = config.timeoutMs ?? 25_000;
    this.pollMs = config.pollMs ?? 100;
  }

  async submit(content: string): Promise<SubmitResult> {
    await mkdir(this.config.dir, { recursive: true });
    const fileId = newFileId();
    const tmp = join(this.config.dir, `${fileId}.tmp`);
    const final = join(this.config.dir, `${fileId}.${this.extension}`);
    // ASCII: i comandi sono già ripuliti, "latin1" evita sorprese sul byte order mark
    await writeFile(tmp, content, "latin1");
    await rename(tmp, final);

    const candidates = [
      join(this.config.dir, `Response_${fileId}.xml`),
      join(this.config.dir, `Response_${fileId}.${this.extension}.xml`),
    ];
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      for (const path of candidates) {
        try {
          if ((await stat(path)).size === 0) continue;
          const xml = await readFile(path, "latin1");
          if (isCompleteResponse(xml)) {
            return { kind: "response", fileId, response: parseResponseXml(xml) };
          }
        } catch {
          // il file non c'è ancora
        }
      }
      await sleep(this.pollMs);
    }
    return { kind: "timeout", fileId };
  }
}
