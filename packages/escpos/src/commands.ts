/** Comandi ESC/POS base (byte raw) */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

export const CMD_INIT = Buffer.from([ESC, 0x40]);
export const CMD_ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
export const CMD_ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
export const CMD_DOUBLE_SIZE = Buffer.from([GS, 0x21, 0x11]);
export const CMD_NORMAL_SIZE = Buffer.from([GS, 0x21, 0x00]);
export const CMD_REVERSE_ON = Buffer.from([GS, 0x42, 0x01]);
export const CMD_REVERSE_OFF = Buffer.from([GS, 0x42, 0x00]);
export const CMD_CUT = Buffer.from([GS, 0x56, 0x00]);

export function textLine(text: string): Buffer {
  return Buffer.from(`${text}\n`, "utf-8");
}

export function concatBuffers(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts);
}
