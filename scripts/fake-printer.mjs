#!/usr/bin/env node
/**
 * Simulatore di stampante termica di rete (TCP raw, porta 9100).
 *
 * Riceve i ticket ESC/POS come farebbe una stampante LAN reale (es. POS Italia
 * ST30), salva i byte grezzi e una resa testuale leggibile in tmp/fake-printer/.
 * Usare con HARDWARE_BRIDGE_MODE=network e stampanti configurate su 127.0.0.1:9100.
 *
 *   node scripts/fake-printer.mjs [porta]
 */
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.argv[2] ?? 9100);
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tmp", "fake-printer");
const COLS = 48; // ST30 / carta 80 mm, Font A

const CP1252_HIGH = "€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ";
const CODE_PAGE_NAMES = { 0: "PC437", 2: "PC850", 16: "WPC1252", 19: "PC858" };

function decodeCp1252(byte) {
  if (byte >= 0x80 && byte <= 0x9f) return CP1252_HIGH[byte - 0x80];
  return String.fromCharCode(byte);
}

/** Interpreta i comandi ESC/POS usati da @pizzaguys/escpos e produce testo leggibile. */
function render(buf) {
  const out = [];
  const warnings = [];
  let line = "";
  let align = "L";
  let double = false;
  let codePage = 0;

  const flush = () => {
    const width = double ? COLS / 2 : COLS;
    if (line.length > width) warnings.push(`riga oltre ${width} colonne: "${line}"`);
    let text = line;
    if (align === "C") text = text.padStart(Math.floor((COLS + text.length) / 2));
    out.push(double ? `${text}   [x2]` : text);
    line = "";
  };

  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x1b) {
      const cmd = buf[++i];
      if (cmd === 0x40) continue; // ESC @ init
      if (cmd === 0x74) codePage = buf[++i]; // ESC t n
      else if (cmd === 0x61) align = buf[++i] === 1 ? "C" : "L"; // ESC a n
      else i++; // altri ESC x n
      continue;
    }
    if (b === 0x1d) {
      const cmd = buf[++i];
      const n = buf[++i];
      if (cmd === 0x21) double = n !== 0; // GS ! n
      else if (cmd === 0x56) { if (line) flush(); out.push("-".repeat(COLS) + "  ✂ taglio"); }
      continue;
    }
    if (b === 0x0a) { flush(); continue; }
    if (b >= 0x80 && codePage !== 16) {
      warnings.push(`byte 0x${b.toString(16)} con code page ${CODE_PAGE_NAMES[codePage] ?? codePage}: accenti errati`);
    }
    line += decodeCp1252(b);
  }
  if (line) flush();
  return { text: out.join("\n"), warnings, codePage: CODE_PAGE_NAMES[codePage] ?? String(codePage) };
}

mkdirSync(OUT_DIR, { recursive: true });

const server = createServer((socket) => {
  const chunks = [];
  socket.on("data", (c) => chunks.push(c));
  socket.on("end", () => {
    const payload = Buffer.concat(chunks);
    if (payload.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { text, warnings, codePage } = render(payload);
    writeFileSync(join(OUT_DIR, `${stamp}.escpos`), payload);
    writeFileSync(join(OUT_DIR, `${stamp}.txt`), `${text}\n`);
    console.log(`\n🖨  ticket ricevuto da ${socket.remoteAddress} — ${payload.length} byte, code page ${codePage}`);
    console.log(text);
    for (const w of warnings) console.log(`⚠  ${w}`);
  });
  socket.on("error", (err) => console.error("errore connessione:", err.message));
});

server.listen(PORT, () => {
  console.log(`Stampante simulata in ascolto su :${PORT} — ticket salvati in ${OUT_DIR}`);
});
