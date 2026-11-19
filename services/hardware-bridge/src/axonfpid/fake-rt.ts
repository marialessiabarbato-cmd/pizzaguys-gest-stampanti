import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FakeRtOptions {
  dir: string;
  extension?: string;
  pollMs?: number;
  /** Se impostato, risponde con questo errore (codice RT) invece di OK. */
  failWithReply?: string;
  /** Se true non risponde mai (simula RT bloccato). */
  silent?: boolean;
}

/**
 * RT finto: legge i TXT dalla cartella come farebbe axonFPiD, controlla che
 * ogni riga sia un comando noto e scrive Response_<id>.xml. Serve a provare
 * HuBbì senza toccare la stampante vera. Formato della risposta: ricavato dal
 * manuale (ESITO/REPLY/DEVICE_STATUS/FISCAL_STATUS/ECCEZIONE), non verificato
 * su un file reale.
 */
export function startFakeRt(opts: FakeRtOptions): { stop(): void; documents: string[] } {
  const ext = (opts.extension ?? "TXT").replace(/^\./, "");
  const seen = new Set<string>();
  const documents: string[] = [];
  let stopped = false;

  const tick = async () => {
    if (stopped || opts.silent) return;
    let names: string[];
    try {
      names = await readdir(opts.dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith(`.${ext}`) || seen.has(name)) continue;
      seen.add(name);
      const id = name.slice(0, -(ext.length + 1));
      const text = await readFile(join(opts.dir, name), "latin1");
      documents.push(text);
      const lines = text.split(/\r?\n/).filter(Boolean);
      const bad = lines.findIndex((l) => !/^(I|3|4|5|U)\//.test(l));
      let xml: string;
      if (bad >= 0) {
        xml = response("NON OK", "01", `<ECCEZIONE><RIGA>${bad + 1}</RIGA><COMANDO>${lines[bad]}</COMANDO><CODICE>01</CODICE><DESCRIZIONE>Comando non valido</DESCRIZIONE><AZIONE>9</AZIONE></ECCEZIONE>`);
      } else if (opts.failWithReply) {
        xml = response("NON OK", opts.failWithReply, `<ECCEZIONE><RIGA>1</RIGA><COMANDO>${lines[0]}</COMANDO><CODICE>${opts.failWithReply}</CODICE><DESCRIZIONE>Errore simulato</DESCRIZIONE><AZIONE>9</AZIONE></ECCEZIONE>`);
      } else {
        xml = response("OK", "00", "");
      }
      const out = join(opts.dir, `Response_${id}.xml`);
      await writeFile(`${out}.part`, xml, "latin1");
      await rename(`${out}.part`, out);
    }
  };

  const timer = setInterval(() => void tick(), opts.pollMs ?? 50);
  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    documents,
  };
}

function response(esito: string, reply: string, extra: string): string {
  return `<?xml version="1.0"?>\n<RESPONSE>\n<ESITO>${esito}</ESITO>\n<REPLY>${reply}</REPLY>\n<DEVICE_STATUS>00</DEVICE_STATUS>\n<FISCAL_STATUS>00</FISCAL_STATUS>\n${extra}\n</RESPONSE>\n`;
}
