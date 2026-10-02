/** Comandi ESC/POS base (byte raw) */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/** Code page ESC/POS 16 = WPC1252 (Europa occidentale, include € e accenti italiani). */
export const CODE_PAGE_WPC1252 = 16;

/** Reset stampante + selezione code page WPC1252, coerente con encodeText(). */
export const CMD_INIT = Buffer.from([ESC, 0x40, ESC, 0x74, CODE_PAGE_WPC1252]);
export const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
export const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
export const CMD_DOUBLE_SIZE = Buffer.from([GS, 0x21, 0x11]);
export const CMD_NORMAL_SIZE = Buffer.from([GS, 0x21, 0x00]);
export const CMD_REVERSE_ON = Buffer.from([GS, 0x42, 0x01]);
export const CMD_REVERSE_OFF = Buffer.from([GS, 0x42, 0x00]);
/**
 * Righe di avanzamento prima del taglio: la lama è ~15 mm sopra la testina
 * (es. POS Italia ST30), senza avanzamento il taglio cade sulle ultime righe.
 */
export const CUT_FEED_LINES = 5;

/** ESC d n (stampa e avanza n righe) + GS V 0 (taglio totale). */
export const CMD_CUT = Buffer.from([ESC, 0x64, CUT_FEED_LINES, GS, 0x56, 0x00]);

/** Caratteri CP1252 nel range 0x80–0x9F (assente in Latin-1). */
const CP1252_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function cp1252Byte(ch: string): number | undefined {
  const extra = CP1252_EXTRA[ch];
  if (extra !== undefined) return extra;
  const code = ch.codePointAt(0)!;
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code;
  return undefined;
}

/**
 * Codifica il testo in CP1252 (code page selezionata da CMD_INIT): le stampanti
 * termiche non interpretano UTF-8. Caratteri fuori tabella → senza accento, poi "?".
 */
export function encodeText(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const direct = cp1252Byte(ch);
    if (direct !== undefined) {
      bytes.push(direct);
      continue;
    }
    for (const base of ch.normalize("NFD").replace(/\p{M}/gu, "")) {
      bytes.push(cp1252Byte(base) ?? 0x3f);
    }
  }
  return Buffer.from(bytes);
}

export function textLine(text: string): Buffer {
  return encodeText(`${text}\n`);
}

export function concatBuffers(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts);
}
