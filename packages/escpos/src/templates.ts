import {
  CMD_ALIGN_CENTER,
  CMD_ALIGN_LEFT,
  CMD_CUT,
  CMD_DOUBLE_SIZE,
  CMD_INIT,
  CMD_NORMAL_SIZE,
  CMD_REVERSE_OFF,
  CMD_REVERSE_ON,
  concatBuffers,
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
  const parts = (line.variants ?? []).map((v) => textLine(`  + ${v}`));
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

export function buildKitchenTicket(params: KitchenTicketParams): Buffer {
  const parts: Buffer[] = [CMD_INIT, CMD_ALIGN_CENTER, CMD_DOUBLE_SIZE];

  if (params.reprint) {
    parts.push(textLine("*** RISTAMPA ***"));
  }

  parts.push(textLine(params.workCenter.toUpperCase()));
  parts.push(CMD_DOUBLE_SIZE, textLine(`TAVOLO ${params.tableLabel}`));
  parts.push(CMD_NORMAL_SIZE, CMD_ALIGN_LEFT);

  const byCourse = new Map<number, OrderLine[]>();
  for (const line of params.lines) {
    const course = line.course ?? 1;
    byCourse.set(course, [...(byCourse.get(course) ?? []), line]);
  }

  if (byCourse.size === 1 && byCourse.has(1)) {
    // Solo portata "Ora": formato semplice senza intestazioni di sezione.
    if (params.hold) {
      parts.push(textLine("*** IN ATTESA / HOLD ***"));
    }
    for (const line of params.lines) {
      parts.push(textLine(`${line.quantity}x ${line.name}`), ...lineDetailLines(line));
    }
  } else {
    for (const course of [...byCourse.keys()].sort((a, b) => a - b)) {
      const lines = byCourse.get(course)!;
      const waiting = lines.every((l) => l.hold) ? " (in attesa)" : "";
      parts.push(textLine(`-- ${courseLabel(course)}${waiting} --`));
      for (const line of lines) {
        parts.push(textLine(`${line.quantity}x ${line.name}`), ...lineDetailLines(line));
      }
    }
  }

  parts.push(
    textLine("---"),
    textLine(`Ospiti: ${params.guests}`),
    textLine(`Articoli: ${params.lines.reduce((s, l) => s + l.quantity, 0)}`),
    textLine(`Operatore: ${params.operatorName}`),
    textLine(new Date().toLocaleString("it-IT")),
  );

  if (params.reprint) {
    parts.push(textLine("** Reprint **"));
  }

  parts.push(CMD_CUT);
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
    textLine("---"),
  ];

  for (const line of params.receiptText.trimEnd().split("\n")) {
    parts.push(textLine(line));
  }

  parts.push(
    textLine("---"),
    CMD_ALIGN_CENTER,
    textLine("*** NON VALIDO AI FINI FISCALI ***"),
    CMD_CUT,
  );
  return concatBuffers(...parts);
}

/** Preview testuale per UI dev (senza byte binari) */
export function kitchenTicketPreview(params: KitchenTicketParams): string {
  const buf = buildKitchenTicket(params);
  return buf.toString("latin1").replace(/[^\x20-\x7E\n]/g, "");
}
