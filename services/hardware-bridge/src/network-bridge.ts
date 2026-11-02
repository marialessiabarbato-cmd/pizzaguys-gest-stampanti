import { Socket } from "node:net";
import { MockHardwareBridge } from "./mock-bridge.js";
import {
  CONDITION_MESSAGES,
  isBlocking,
  makeStatus,
  readStatusOnSocket,
  type PrinterStatus,
} from "./printer-status.js";
import type {
  FiscalOrderInput,
  HardwareBridge,
  HardwareBridgeConfig,
  PrintResult,
  PrintTarget,
  ReceiptResult,
  ZReportResult,
} from "./types.js";

const CONNECT_TIMEOUT_MS = 4000;
const DEFAULT_STATUS_TIMEOUT_MS = 800;

function connect(target: PrintTarget): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout connessione stampante ${target.host}:${target.port}`));
    }, CONNECT_TIMEOUT_MS);
    socket.once("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
    socket.connect(target.port, target.host, () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function endWith(socket: Socket, payload: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.end(payload, () => {
      socket.destroy();
      resolve();
    });
  });
}

/**
 * Instrada i ticket ESC/POS (comande cucina/bar/preconto) a stampanti di
 * rete reali via TCP raw (porta 9100, standard su stampanti termiche LAN).
 *
 * Prima di stampare legge lo stato della stampante (DLE EOT): con carta finita,
 * coperchio aperto o errore la stampa non viene inviata e il risultato lo dice,
 * così la coda può dirottarla o riprovare invece di darla per stampata.
 *
 * Scontrino fiscale, Z-report e cassetto restano delegati al mock: l'RT
 * richiede un protocollo proprietario (integrazione pianificata per la Fase 7).
 */
export class NetworkHardwareBridge implements HardwareBridge {
  private readonly fallback: MockHardwareBridge;
  private readonly statusCheck: boolean;
  private readonly statusTimeoutMs: number;

  constructor(config: HardwareBridgeConfig) {
    this.fallback = new MockHardwareBridge(config);
    this.statusCheck = config.statusCheck ?? true;
    this.statusTimeoutMs = config.statusTimeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS;
  }

  async printEscPos(
    printerId: string,
    payload: Buffer,
    label = "ticket",
    target?: PrintTarget,
  ): Promise<PrintResult> {
    if (!target) {
      return this.fallback.printEscPos(printerId, payload, label);
    }
    let socket: Socket;
    try {
      socket = await connect(target);
    } catch (err) {
      return {
        success: false,
        printerId,
        condition: "UNREACHABLE",
        error: err instanceof Error ? err.message : "Stampa di rete fallita",
      };
    }
    try {
      let status: PrinterStatus | undefined;
      if (this.statusCheck) {
        status = await readStatusOnSocket(socket, this.statusTimeoutMs);
        if (isBlocking(status.condition)) {
          socket.destroy();
          return {
            success: false,
            printerId,
            condition: status.condition,
            error: CONDITION_MESSAGES[status.condition],
          };
        }
      }
      await endWith(socket, payload);
      return { success: true, printerId, condition: status?.condition };
    } catch (err) {
      socket.destroy();
      return {
        success: false,
        printerId,
        condition: "UNREACHABLE",
        error: err instanceof Error ? err.message : "Stampa di rete fallita",
      };
    }
  }

  async getPrinterStatus(target?: PrintTarget): Promise<PrinterStatus> {
    if (!target) return makeStatus("OK", false);
    let socket: Socket;
    try {
      socket = await connect(target);
    } catch {
      return makeStatus("UNREACHABLE", false);
    }
    try {
      if (!this.statusCheck) return makeStatus("UNKNOWN", false);
      return await readStatusOnSocket(socket, this.statusTimeoutMs);
    } finally {
      socket.destroy();
    }
  }

  emitReceipt(order: FiscalOrderInput): Promise<ReceiptResult> {
    return this.fallback.emitReceipt(order);
  }

  emitZReport(): Promise<ZReportResult> {
    return this.fallback.emitZReport();
  }

  openCashDrawer(): Promise<void> {
    return this.fallback.openCashDrawer();
  }
}
