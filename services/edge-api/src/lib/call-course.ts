import { randomUUID } from "node:crypto";
import { buildCallCourseTicket } from "@pizzaguys/escpos";
import { printers, tables } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { broadcastKdsUpdate } from "./kds-broadcast.js";
import {
  callCourse,
  getTableRuntime,
  type KdsTicket,
} from "./runtime.js";
import { broadcast } from "./ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

function groupLinesByCenter(
  tickets: KdsTicket[],
): Map<string, KdsTicket["lines"]> {
  const byCenter = new Map<string, KdsTicket["lines"]>();
  for (const ticket of tickets) {
    const group = byCenter.get("PIZZERIA") ?? [];
    byCenter.set("PIZZERIA", [...group, ...ticket.lines]);
  }
  return byCenter;
}

export async function processCallCourse(
  app: FastifyInstance,
  tableId: string,
  course: number,
): Promise<{ ok: boolean; released: KdsTicket[]; printResults: unknown[] }> {
  const released = callCourse(tableId, course);
  const table = app.edgeDb.select().from(tables).where(eq(tables.id, tableId)).get();
  const runtime = getTableRuntime(tableId);
  const guestCount = runtime.guests ?? table?.defaultGuests ?? 2;
  const printerList = app.edgeDb.select().from(printers).all();
  const printResults: unknown[] = [];

  if (released.length > 0) {
    const byCenter = groupLinesByCenter(released);
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

  return { ok: true, released, printResults };
}
