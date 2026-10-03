import { randomUUID } from "node:crypto";
import { buildCallCourseTicket } from "@pizzaguys/escpos";
import { printers, tables } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge, type PrintResult } from "@pizzaguys/hardware-bridge";
import { broadcastKdsUpdate } from "./kds-broadcast.js";
import {
  callCourse,
  getUnionGuestTotal,
  type KdsTicket,
} from "./runtime.js";
import { reportPrintFailures } from "./print-alerts.js";
import { createWorkCenterResolver } from "./work-center.js";
import { broadcast } from "./ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

export function groupLinesByCenter(
  tickets: KdsTicket[],
  resolveCenter: (productId?: string) => string,
): Map<string, KdsTicket["lines"]> {
  const byCenter = new Map<string, KdsTicket["lines"]>();
  for (const ticket of tickets) {
    for (const line of ticket.lines) {
      const center = resolveCenter(line.productId);
      byCenter.set(center, [...(byCenter.get(center) ?? []), line]);
    }
  }
  return byCenter;
}

export async function processCallCourse(
  app: FastifyInstance,
  tableId: string,
  course: number,
): Promise<{
  ok: boolean;
  released: KdsTicket[];
  printResults: PrintResult[];
  printWarnings: string[];
}> {
  const released = callCourse(tableId, course);
  const table = app.edgeDb.select().from(tables).where(eq(tables.id, tableId)).get();
  const guestCount = getUnionGuestTotal(tableId) || table?.defaultGuests || 2;
  const printerList = app.edgeDb.select().from(printers).all();
  const printResults: PrintResult[] = [];

  if (released.length > 0) {
    const byCenter = groupLinesByCenter(released, createWorkCenterResolver(app.edgeDb));
    for (const [center, lines] of byCenter) {
      if (lines.length === 0) continue;
      const printer = printerList.find((p) => p.workCenter === center && p.enabled);
      const payload = buildCallCourseTicket({
        course,
        tableLabel: table?.label ?? tableId,
        guests: guestCount,
        lines,
      });
      const result = await hardware.printEscPos(
        printer?.id ?? center.toLowerCase(),
        payload,
        `call-${tableId}-${course}`,
        printer ? { host: printer.host, port: printer.port } : undefined,
      );
      printResults.push(result);
    }
  }

  broadcastKdsUpdate();

  broadcast({
    type: "CALL_COURSE",
    payload: { tableId, course, tableLabel: table?.label ?? tableId },
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  });

  const printWarnings = reportPrintFailures(
    app.edgeDb,
    "MARCIA",
    table?.label ?? tableId,
    printResults,
  );
  return { ok: true, released, printResults, printWarnings };
}
