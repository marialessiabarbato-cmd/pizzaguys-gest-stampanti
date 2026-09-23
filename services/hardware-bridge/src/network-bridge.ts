import { Socket } from "node:net";
import { MockHardwareBridge } from "./mock-bridge.js";
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

function writeToSocket(target: PrintTarget, payload: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(
      () => finish(new Error(`Timeout connessione stampante ${target.host}:${target.port}`)),
      CONNECT_TIMEOUT_MS,
    );

    socket.once("error", (err) => finish(err));
    socket.connect(target.port, target.host, () => {
      socket.end(payload, () => finish());
    });
  });
}

/**
 * Instrada i ticket ESC/POS (comande cucina/bar/preconto) a stampanti di
 * rete reali via TCP raw (porta 9100, standard su stampanti termiche LAN).
 *
 * Scontrino fiscale, Z-report e cassetto restano delegati al mock: l'RT
 * Micrelec Hydra SF20 richiede un protocollo proprietario e non è coperto
 * da questo bridge (integrazione pianificata per la Fase 7).
 */
export class NetworkHardwareBridge implements HardwareBridge {
  private readonly fallback: MockHardwareBridge;

  constructor(config: HardwareBridgeConfig) {
    this.fallback = new MockHardwareBridge(config);
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
    try {
      await writeToSocket(target, payload);
      return { success: true, printerId };
    } catch (err) {
      return {
        success: false,
        printerId,
        error: err instanceof Error ? err.message : "Stampa di rete fallita",
      };
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
