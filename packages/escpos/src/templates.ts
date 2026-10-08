import {
  CMD_ALIGN_CENTER,
  CMD_ALIGN_LEFT,
  CMD_CUT,
  CMD_DOUBLE_HEIGHT,
  CMD_DOUBLE_SIZE,
  CMD_INIT,
  CMD_NORMAL_SIZE,
  CMD_REVERSE_OFF,
  CMD_REVERSE_ON,
  LINE_WIDTH,
  concatBuffers,
  separatorLine,
  stripEscPos,
  textLine,
} from "./commands.js";

export interface OrderLine {
  name: string;
  quantity: number;
  variants?: string[];
  /** Nota libera del cameriere (es. "ben cotta", "allergia"). */
  notes?: string;
  /** Portata (1 = Ora, 2–3 = Segue, 4 = Dolce), come nel palmare. */
  course?: number;
  /** Riga in attesa di "Marcia". */
  hold?: boolean;
}

/** Nome della portata come nel palmare (handheld-web/src/lib/course.ts). */
export function courseLabel(course: number): string {
  if (course <= 1) return "ORA";
  if (course >= 4) return "DOLCE";
  return `SEGUE >${course - 1}`;
}

function lineDetailLines(line: OrderLine): Buffer[] {
  // Le rimozioni arrivano già come "NO …": il "+" resta solo per le aggiunte.
  const parts = (line.variants ?? []).map((v) => textLine(v.startsWith("NO ") ? `  ${v}` : `  + ${v}`));
  const note = line.notes?.trim();
  if (note) parts.push(textLine(`  NOTA: ${note}`));
  return parts;
}

export interface KitchenTicketParams {
  workCenter: string;
  tableLabel: string;
  guests: number;
  operatorName: string;
  lines: OrderLine[];
  hold?: boolean;
  reprint?: boolean;
}

/** Riga articolo in doppia altezza (leggibile da lontano), dettagli in font normale. */
function kitchenItemLines(line: OrderLine): Buffer[] {
  return [
    CMD_DOUBLE_HEIGHT,
    textLine(`${line.quantity} x ${line.name.toLocaleUpperCase("it-IT")}`),
    CMD_NORMAL_SIZE,
    ...lineDetailLines(line),
  ];
}

function fineComandaLine(): Buffer {
  const label = " Fine Comanda ";
  const side = Math.floor((LINE_WIDTH - label.length) / 2);
  return textLine(`${"-".repeat(side)}${label}${"-".repeat(LINE_WIDTH - label.length - side)}`);
}

/** Intestazione comanda: eventuale titolo, ristampa e tavolo in negativo. */
function comandaHeader(tableLabel: string, reprint?: boolean, title?: string): Buffer[] {
  const parts: Buffer[] = [CMD_INIT, CMD_ALIGN_CENTER, CMD_DOUBLE_SIZE];
  if (reprint) parts.push(textLine("*** RISTAMPA ***"));
  if (title) parts.push(textLine(title));
  parts.push(CMD_REVERSE_ON, textLine(` TAVOLO ${tableLabel} `), CMD_REVERSE_OFF);
  parts.push(CMD_NORMAL_SIZE, CMD_ALIGN_LEFT, separatorLine());
  return parts;
}

/** Articoli divisi per portata (Ora / Segue / Dolce), come nel palmare. */
function comandaBody(lines: OrderLine[], hold?: boolean): Buffer[] {
  const parts: Buffer[] = [];
  const byCourse = new Map<number, OrderLine[]>();
  for (const line of lines) {
    const course = line.course ?? 1;
    byCourse.set(course, [...(byCourse.get(course) ?? []), line]);
  }

  if (byCourse.size === 1 && byCourse.has(1)) {
    // Solo portata "Ora": formato semplice senza intestazioni di sezione.
    if (hold) {
      parts.push(textLine("*** IN ATTESA / HOLD ***"));
    }
    for (const line of lines) {
      parts.push(...kitchenItemLines(line));
    }
  } else {
    for (const course of [...byCourse.keys()].sort((a, b) => a - b)) {
      const courseLines = byCourse.get(course)!;
      const waiting = courseLines.every((l) => l.hold) ? " (in attesa)" : "";
      parts.push(textLine(`-- ${courseLabel(course)}${waiting} --`));
      for (const line of courseLines) {
        parts.push(...kitchenItemLines(line));
      }
    }
  }
  return parts;
}

/** Piede comanda: data/ora, ospiti, articoli, operatore e "Fine Comanda". */
function comandaFooter(params: {
  guests: number;
  itemCount: number;
  operatorName: string;
  reprint?: boolean;
}): Buffer[] {
  const now = new Date();
  const date = now.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const parts: Buffer[] = [
    separatorLine(),
    CMD_DOUBLE_HEIGHT,
    textLine(`Data: ${date}  Ora: ${time}`),
    CMD_NORMAL_SIZE,
    textLine(`Ospiti: ${params.guests}`),
    textLine(`Articoli: ${params.itemCount}`),
    textLine(`Operatore: ${params.operatorName}`),
  ];
  if (params.reprint) {
    parts.push(textLine("** Reprint **"));
  }
  parts.push(fineComandaLine(), CMD_CUT);
  return parts;
}

function itemCount(lines: OrderLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

export function buildKitchenTicket(params: KitchenTicketParams): Buffer {
  return concatBuffers(
    ...comandaHeader(params.tableLabel, params.reprint),
    ...comandaBody(params.lines, params.hold),
    ...comandaFooter({
      guests: params.guests,
      itemCount: itemCount(params.lines),
      operatorName: params.operatorName,
      reprint: params.reprint,
    }),
  );
}

export interface GeneralTicketSection {
  /** Reparto (es. "BAR", "CUCINA"), stampato come intestazione della sezione. */
  workCenter: string;
  lines: OrderLine[];
}

export interface GeneralTicketParams {
  tableLabel: string;
  guests: number;
  operatorName: string;
  sections: GeneralTicketSection[];
}

/** Comanda generale: tutto l'invio di Spedisci in un unico ticket, diviso per reparto. */
export function buildGeneralTicket(params: GeneralTicketParams): Buffer {
  const parts: Buffer[] = comandaHeader(params.tableLabel, false, "COMANDA GENERALE");
  params.sections.forEach((section, i) => {
    if (i > 0) parts.push(textLine(""));
    parts.push(
      CMD_REVERSE_ON,
      textLine(` ${section.workCenter.toUpperCase()} `),
      CMD_REVERSE_OFF,
      ...comandaBody(section.lines),
    );
  });
  parts.push(
    ...comandaFooter({
      guests: params.guests,
      itemCount: itemCount(params.sections.flatMap((s) => s.lines)),
      operatorName: params.operatorName,
    }),
  );
  return concatBuffers(...parts);
}

export interface CancelTicketParams {
  tableLabel: string;
  itemName: string;
  quantity: number;
  operatorName: string;
  authorizedBy: string;
}

export function buildCancelTicket(params: CancelTicketParams): Buffer {
  return concatBuffers(
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_DOUBLE_SIZE,
    CMD_REVERSE_ON,
    textLine("=== ANNULLO PIATTO ==="),
    CMD_REVERSE_OFF,
    CMD_NORMAL_SIZE,
    CMD_ALIGN_LEFT,
    textLine(`Tavolo: ${params.tableLabel}`),
    textLine(`Qty: ${params.quantity} - ${params.itemName}`),
    textLine(`Ora: ${new Date().toLocaleString("it-IT")}`),
    textLine(`Operatore: ${params.operatorName}`),
    textLine(`Autorizzato: ${params.authorizedBy}`),
    textLine("*** VERIFICARE CON LA SALA ***"),
    CMD_CUT,
  );
}

export interface PrebillLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PrebillTicketParams {
  tableLabel: string;
  lines: PrebillLine[];
  total: number;
  operatorName?: string;
}

export function buildPrebillTicket(params: PrebillTicketParams): Buffer {
  const parts: Buffer[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    textLine("*** DOCUMENTO NON FISCALE ***"),
    textLine("PRECONTO"),
    CMD_ALIGN_LEFT,
    textLine(`Tavolo: ${params.tableLabel}`),
    textLine("---"),
  ];

  for (const line of params.lines) {
    parts.push(textLine(`${line.quantity}x ${line.name}`));
    parts.push(textLine(`  € ${line.lineTotal.toFixed(2)}`));
  }

  parts.push(
    textLine("---"),
    CMD_ALIGN_CENTER,
    CMD_DOUBLE_SIZE,
    textLine(`TOTALE € ${params.total.toFixed(2)}`),
    CMD_NORMAL_SIZE,
    CMD_ALIGN_LEFT,
    textLine(new Date().toLocaleString("it-IT")),
  );

  if (params.operatorName) {
    parts.push(textLine(`Operatore: ${params.operatorName}`));
  }

  parts.push(
    CMD_ALIGN_CENTER,
    textLine("*** NON VALIDO AI FINI FISCALI ***"),
    CMD_CUT,
  );
  return concatBuffers(...parts);
}

export interface ReservationPrintRow {
  seqNumber: number;
  reservationDate: string;
  reservationTime: string;
  customerName: string;
  guests: number;
  tableLabel?: string | null;
  shiftLabel: string;
  statusLabel: string;
  notes?: string | null;
}

export interface ReservationsListTicketParams {
  locationName?: string;
  from: string;
  to: string;
  printedAt: string;
  operatorName?: string;
  rows: ReservationPrintRow[];
  summaryGuests: number;
}

export function buildReservationsListTicket(params: ReservationsListTicketParams): Buffer {
  const parts: Buffer[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_DOUBLE_SIZE,
    textLine("PRENOTAZIONI"),
    CMD_NORMAL_SIZE,
    textLine(params.locationName ?? "Pizza Guys"),
    textLine(`${params.from} — ${params.to}`),
    CMD_ALIGN_LEFT,
    textLine("---"),
  ];

  for (const row of params.rows) {
    parts.push(
      textLine(
        `${row.reservationDate} ${row.reservationTime} · #${row.seqNumber} · ${row.shiftLabel}`,
      ),
    );
    parts.push(
      textLine(
        `${row.customerName} (${row.guests} p.) · Tav. ${row.tableLabel ?? "—"} · ${row.statusLabel}`,
      ),
    );
    if (row.notes?.trim()) {
      parts.push(textLine(`Note: ${row.notes.trim().slice(0, 60)}`));
    }
    parts.push(textLine(""));
  }

  parts.push(
    textLine("---"),
    textLine(`Prenotazioni: ${params.rows.length} · Coperti: ${params.summaryGuests}`),
    textLine(`Stampato: ${params.printedAt}`),
  );
  if (params.operatorName) {
    parts.push(textLine(`Operatore: ${params.operatorName}`));
  }
  parts.push(CMD_ALIGN_CENTER, textLine("*** NON FISCALE ***"), CMD_CUT);
  return concatBuffers(...parts);
}

export interface CallCourseTicketParams {
  course: number;
  tableLabel: string;
  guests: number;
  lines: OrderLine[];
}

export function buildCallCourseTicket(params: CallCourseTicketParams): Buffer {
  const parts: Buffer[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_DOUBLE_SIZE,
    textLine(`=== MARCIA ${courseLabel(params.course)} ===`),
    CMD_NORMAL_SIZE,
    textLine(`TAVOLO ${params.tableLabel}`),
    CMD_ALIGN_LEFT,
  ];

  for (const line of params.lines) {
    parts.push(textLine(`${line.quantity}x ${line.name}`), ...lineDetailLines(line));
  }

  parts.push(
    textLine("---"),
    textLine(`Ospiti: ${params.guests}`),
    textLine(new Date().toLocaleString("it-IT")),
    CMD_CUT,
  );

  return concatBuffers(...parts);
}

export interface ReceiptCopyTicketParams {
  /** Testo dello scontrino già formattato (es. formatMockReceiptText). */
  receiptText: string;
}

/** Copia di cortesia dello scontrino su stampante termica: non ha valore fiscale. */
export function buildReceiptCopyTicket(params: ReceiptCopyTicketParams): Buffer {
  const parts: Buffer[] = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    textLine("*** COPIA NON FISCALE ***"),
    CMD_DOUBLE_SIZE,
    textLine("PIZZA GUYS"),
    CMD_NORMAL_SIZE,
    CMD_ALIGN_LEFT,
    textLine(""),
  ];

  for (const line of params.receiptText.trimEnd().split("\n")) {
    // La riga del totale (formatMockReceiptText) va in doppia altezza, come gli articoli in comanda.
    if (line.startsWith("TOTALE ")) {
      parts.push(CMD_DOUBLE_HEIGHT, textLine(line), CMD_NORMAL_SIZE);
    } else {
      parts.push(textLine(line));
    }
  }

  parts.push(
    textLine(""),
    CMD_ALIGN_CENTER,
    textLine("*** NON VALIDO AI FINI FISCALI ***"),
    CMD_CUT,
  );
  return concatBuffers(...parts);
}

/** Preview testuale per UI dev (senza byte binari) */
export function kitchenTicketPreview(params: KitchenTicketParams): string {
  return stripEscPos(buildKitchenTicket(params)).replace(/[^\x20-\x7E\n]/g, "");
}
