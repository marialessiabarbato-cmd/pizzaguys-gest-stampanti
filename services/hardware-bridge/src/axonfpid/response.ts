/**
 * Lettura del file Response_<nome>.xml scritto da axonFPiD.
 * Dal manuale 5.2.1 i tag sono ESITO, REPLY, DEVICE_STATUS, FISCAL_STATUS ed
 * ECCEZIONE (riga, comando, codice, descrizione, azione). I nomi esatti dei
 * campi dell'ECCEZIONE non sono confermati: il parser è tollerante e conserva
 * il testo grezzo per il log.
 */

export interface RtException {
  riga?: string;
  comando?: string;
  codice?: string;
  descrizione?: string;
  azione?: string;
}

export interface RtResponse {
  /** true solo con ESITO = OK */
  ok: boolean;
  esito?: string;
  reply?: string;
  deviceStatus?: string;
  fiscalStatus?: string;
  eccezione?: RtException;
  raw: string;
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? m[1]!.trim() : undefined;
}

/** Il file è completo solo se ha un ESITO chiuso: evita di leggerlo a metà scrittura. */
export function isCompleteResponse(xml: string): boolean {
  return /<ESITO[^>]*>[\s\S]*?<\/ESITO>/i.test(xml);
}

export function parseResponseXml(xml: string): RtResponse {
  const esito = tag(xml, "ESITO");
  const ecc = tag(xml, "ECCEZIONE");
  const eccezione: RtException | undefined = ecc
    ? {
        riga: tag(ecc, "RIGA"),
        comando: tag(ecc, "COMANDO"),
        codice: tag(ecc, "CODICE"),
        descrizione: tag(ecc, "DESCRIZIONE"),
        azione: tag(ecc, "AZIONE"),
      }
    : undefined;
  return {
    ok: esito?.toUpperCase() === "OK",
    esito,
    reply: tag(xml, "REPLY"),
    deviceStatus: tag(xml, "DEVICE_STATUS"),
    fiscalStatus: tag(xml, "FISCAL_STATUS"),
    eccezione,
    raw: xml,
  };
}

/** Codici di risposta dell'RT più comuni (manuale axonFPiD), in italiano. */
const REPLY_MESSAGES: Record<string, string> = {
  "10": "Operatore inesistente",
  "11": "Password operatore errata",
  "16": "Giornata fiscale già aperta",
  "20": "C'è uno scontrino già aperto sull'RT",
  "26": "Stampante occupata, riprova tra poco",
  "44": "Carta finita nell'RT",
  "51": "Sportello della stampante fiscale aperto",
  "64": "Impossibile aprire il cassetto",
  "118": "RT disabilitato",
  "165": "RT disabilitato",
  "119": "Certificato dell'RT scaduto",
  "166": "Certificato dell'RT scaduto",
  "120": "RT in periodo inattivo",
  "167": "RT in periodo inattivo",
};

export function describeFailure(res: RtResponse): string {
  const code = res.eccezione?.codice ?? res.reply;
  const known = code ? REPLY_MESSAGES[String(Number(code))] : undefined;
  const detail = res.eccezione?.descrizione;
  const parts = [known ?? detail ?? "Errore dalla stampante fiscale"];
  if (code && code !== "00") parts.push(`(codice ${code}${res.eccezione?.riga ? `, riga ${res.eccezione.riga}` : ""})`);
  return parts.join(" ");
}
