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

  if (params.hold) {
    parts.push(textLine("*** IN ATTESA / HOLD ***"));
  }

  for (const line of params.lines) {
    parts.push(textLine(`${line.quantity}x ${line.name}`));
    for (const v of line.variants ?? []) {
      parts.push(textLine(`  + ${v}`));
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
    CMD_DOUBLE_SIZE,
    textLine("*** DOCUMENTO NON FISCALE ***"),
    CMD_NORMAL_SIZE,
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
    textLine(`=== CHIAMA PORTATA ${params.course} ===`),
    CMD_NORMAL_SIZE,
    textLine(`TAVOLO ${params.tableLabel}`),
    CMD_ALIGN_LEFT,
    textLine("SEGUE ->"),
  ];

  for (const line of params.lines) {
    parts.push(textLine(`${line.quantity}x ${line.name}`));
    for (const v of line.variants ?? []) {
      parts.push(textLine(`  + ${v}`));
    }
  }

  parts.push(
    textLine("---"),
    textLine(`Ospiti: ${params.guests}`),
    textLine(new Date().toLocaleString("it-IT")),
    CMD_CUT,
  );

  return concatBuffers(...parts);
}

/** Preview testuale per UI dev (senza byte binari) */
export function kitchenTicketPreview(params: KitchenTicketParams): string {
  const buf = buildKitchenTicket(params);
  return buf.toString("utf-8").replace(/[^\x20-\x7E\n]/g, "");
}
