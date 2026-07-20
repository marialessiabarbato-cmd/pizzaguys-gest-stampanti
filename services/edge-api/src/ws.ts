import { randomUUID } from "node:crypto";
import { edgeState, tables } from "@pizzaguys/edge-db";
import type { WsEnvelope } from "@pizzaguys/types";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { consolidateBillForTable } from "./lib/cover-charge.js";
import { processCallCourse } from "./lib/call-course.js";
import { executeTablePayment } from "./lib/payment.js";
import {
  createPaymentRequest,
  getKdsSnapshot,
  getAnalyticSplit,
  getPaymentRequest,
  getRomanSplit,
  getTableRuntime,
  releaseDessertQueue,
  releaseLock,
  requestLock,
  setBillRequested,
  setTableOccupied,
} from "./lib/runtime.js";
import { verifyManagerPin } from "./lib/staff-auth.js";
import { parseGuestCount, effectiveCapacityForTable } from "./lib/table-capacity.js";
import { printTablePrebill } from "./lib/prebill-print.js";
import { addWsClient, broadcast, broadcastTableStatus, removeWsClient } from "./lib/ws-hub.js";

type WsClient = { send: (data: string) => void; readyState: number };

export function registerWebSocket(app: FastifyInstance, _clients: Set<WsClient>) {
  app.get("/ws", { websocket: true }, (socket) => {
    addWsClient(socket);

    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsEnvelope;
        const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();

        const reply = (type: WsEnvelope["type"], payload: unknown) => {
          socket.send(
            JSON.stringify({
              type,
              payload,
              timestamp: new Date().toISOString(),
              messageId: randomUUID(),
            } satisfies WsEnvelope),
          );
        };

        switch (msg.type) {
          case "HANDSHAKE":
            reply("HANDSHAKE_ACK", {
              edgeId: state?.edgeDeviceId ?? "unprovisioned",
              locationId: state?.locationId ?? "unprovisioned",
              schemaVersion: state?.schemaVersion ?? 0,
              serverTime: new Date().toISOString(),
            });
            break;
          case "PING":
            reply("PONG", { serverTime: new Date().toISOString() });
            break;
          case "REQUEST_TABLE_LOCK": {
            if (state?.status !== "ACTIVE") {
              reply("LOCK_DENIED", { reason: "Edge non provisionata" });
              break;
            }
            const payload = msg.payload as {
              tableId: string;
              operatorId: string;
              operatorName: string;
              overridePin?: string;
              guests?: number;
            };

            let force = false;
            if (payload.overridePin) {
              const manager = await verifyManagerPin(app.edgeDb, payload.overridePin);
              if (!manager) {
                reply("LOCK_DENIED", { tableId: payload.tableId, reason: "PIN sblocco non valido" });
                break;
              }
              force = true;
            }

            const table = app.edgeDb
              .select()
              .from(tables)
              .where(eq(tables.id, payload.tableId))
              .get();

            const guestsParsed = parseGuestCount(
              typeof payload.guests === "number" ? payload.guests : undefined,
              table ? effectiveCapacityForTable(app.edgeDb, payload.tableId) : 0,
            );
            if (!guestsParsed.ok) {
              reply("LOCK_DENIED", { tableId: payload.tableId, reason: guestsParsed.error });
              break;
            }
            const guests = guestsParsed.guests;

            const result = requestLock(
              payload.tableId,
              payload.operatorId,
              payload.operatorName,
              force,
              guests,
            );
            if (!result.granted) {
              reply("LOCK_DENIED", { tableId: payload.tableId, reason: result.reason });
              break;
            }
            const runtime = getTableRuntime(payload.tableId);
            reply("LOCK_GRANTED", { ...payload, status: runtime.status, guests: runtime.guests });
            broadcast({
              type: "TABLE_LOCKED_BROADCAST",
              payload: {
                tableId: payload.tableId,
                operatorId: payload.operatorId,
                operatorName: payload.operatorName,
                status: "LOCKED",
                guests: runtime.guests,
              },
              timestamp: new Date().toISOString(),
              messageId: randomUUID(),
            });
            break;
          }
          case "RELEASE_TABLE_LOCK": {
            const payload = msg.payload as { tableId: string; operatorId: string };
            const released = releaseLock(payload.tableId, payload.operatorId);
            if (released) {
              broadcastTableStatus(payload.tableId, getTableRuntime(payload.tableId).status);
            }
            break;
          }
          case "ORDER_SUBMIT": {
            const payload = msg.payload as {
              tableId: string;
              orderId: string;
              tableLabel?: string;
              kdsTickets?: unknown[];
            };
            setTableOccupied(payload.tableId);
            broadcastTableStatus(payload.tableId, "OCCUPIED");
            broadcast({
              type: "KDS_ORDER_UPDATE",
              payload: {
                ...getKdsSnapshot(),
                ...payload,
              },
              timestamp: new Date().toISOString(),
              messageId: randomUUID(),
            });
            break;
          }
          case "CALL_COURSE": {
            const payload = msg.payload as { tableId: string; course: number };
            await processCallCourse(app, payload.tableId, payload.course);
            break;
          }
          case "REQUEST_STORNO_AUTHORIZATION": {
            const payload = msg.payload as { managerPin: string; requestId: string };
            const manager = await verifyManagerPin(app.edgeDb, payload.managerPin);
            if (!manager) {
              reply("STORNO_AUTHORIZED", { requestId: payload.requestId, authorized: false });
              break;
            }
            reply("STORNO_AUTHORIZED", {
              requestId: payload.requestId,
              authorized: true,
              authorizedBy: `${manager.firstName} ${manager.lastName}`,
              managerId: manager.id,
            });
            break;
          }
          case "REQUEST_PAYMENT": {
            const payload = msg.payload as {
              tableId: string;
              operatorId: string;
              operatorName: string;
            };
            const table = app.edgeDb
              .select()
              .from(tables)
              .where(eq(tables.id, payload.tableId))
              .get();
            if (!table) {
              reply("PAYMENT_REJECTED", { reason: "Tavolo non trovato" });
              break;
            }
            const bill = consolidateBillForTable(app.edgeDb, payload.tableId);
            if (bill.lines.length === 0) {
              reply("PAYMENT_REJECTED", { reason: "Conto vuoto" });
              break;
            }
            const request = createPaymentRequest({
              tableId: payload.tableId,
              tableLabel: table.label,
              operatorId: payload.operatorId,
              operatorName: payload.operatorName,
              total: bill.total,
            });
            setBillRequested(payload.tableId);
            broadcastTableStatus(payload.tableId, "BILL_REQUESTED");
            void printTablePrebill(app.edgeDb, payload.tableId);
            broadcast({
              type: "PAYMENT_PENDING",
              payload: {
                requestId: request.id,
                tableId: request.tableId,
                tableLabel: request.tableLabel,
                total: request.total,
                operatorId: request.operatorId,
                operatorName: request.operatorName,
                requestedAt: request.requestedAt,
              },
              timestamp: new Date().toISOString(),
              messageId: randomUUID(),
            });
            reply("PAYMENT_PENDING", {
              requestId: request.id,
              tableId: request.tableId,
              total: request.total,
            });
            break;
          }
          case "CONFIRM_PAYMENT": {
            const payload = msg.payload as {
              requestId: string;
              paymentMethod: "CASH" | "POS" | "MEAL_VOUCHER" | "SATISPAY" | "OTHER";
              amountReceived?: number;
              operatorId: string;
              operatorName: string;
            };
            const request = getPaymentRequest(payload.requestId);
            if (!request || request.status !== "PENDING") {
              reply("RECEIPT_ERROR", { success: false, errorMessage: "Richiesta pagamento non valida" });
              break;
            }
            const payTable = app.edgeDb
              .select()
              .from(tables)
              .where(eq(tables.id, request.tableId))
              .get();
            const roman = getRomanSplit(request.tableId);
            const analytic = getAnalyticSplit(request.tableId);
            const result = await executeTablePayment({
              edgeDb: app.edgeDb,
              tableId: request.tableId,
              locationId: state?.locationId ?? "unknown",
              paymentMethod: payload.paymentMethod,
              amountReceived: payload.amountReceived,
              splitMode: analytic ? "ANALYTIC" : roman ? "ROMAN" : "FULL",
              paymentRequestId: payload.requestId,
              operatorId: payload.operatorId,
              operatorName: payload.operatorName,
              tableLabel: payTable?.label ?? request.tableLabel,
              isVirtual: payTable?.isVirtual,
              virtualType: payTable?.virtualType,
            });
            if (!result.ok) {
              reply("RECEIPT_ERROR", { success: false, errorMessage: result.error });
              break;
            }
            reply("RECEIPT_SUCCESS", {
              tableId: request.tableId,
              receiptId: result.receipt.id,
              success: true,
              change: result.change,
            });
            break;
          }
          case "TRIGGER_FISCAL_RECEIPT": {
            const payload = msg.payload as {
              tableId: string;
              paymentMethod: "CASH" | "POS" | "MEAL_VOUCHER" | "SATISPAY" | "OTHER";
              amountReceived?: number;
              operatorId?: string;
              operatorName?: string;
            };
            const fiscalTable = app.edgeDb
              .select()
              .from(tables)
              .where(eq(tables.id, payload.tableId))
              .get();
            const roman = getRomanSplit(payload.tableId);
            const analytic = getAnalyticSplit(payload.tableId);
            const result = await executeTablePayment({
              edgeDb: app.edgeDb,
              tableId: payload.tableId,
              locationId: state?.locationId ?? "unknown",
              paymentMethod: payload.paymentMethod,
              amountReceived: payload.amountReceived,
              splitMode: analytic ? "ANALYTIC" : roman ? "ROMAN" : "FULL",
              operatorId: payload.operatorId ?? "ws",
              operatorName: payload.operatorName ?? "Cassa",
              tableLabel: fiscalTable?.label ?? payload.tableId,
              isVirtual: fiscalTable?.isVirtual,
              virtualType: fiscalTable?.virtualType,
            });
            if (!result.ok) {
              reply("RECEIPT_ERROR", { success: false, errorMessage: result.error });
              break;
            }
            reply("RECEIPT_SUCCESS", {
              tableId: payload.tableId,
              receiptId: result.receipt.id,
              success: true,
              change: result.change,
            });
            break;
          }
          default:
            break;
        }
      } catch {
        socket.send(JSON.stringify({ type: "ERROR", payload: { message: "Invalid message" } }));
      }
    });

    socket.on("close", () => removeWsClient(socket));
  });
}
