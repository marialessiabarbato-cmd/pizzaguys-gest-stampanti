export type {
  FiscalOrderInput,
  HardwareBridge,
  HardwareBridgeConfig,
  PrintResult,
  PrintTarget,
  ReceiptResult,
  ZReportResult,
} from "./types.js";
export {
  CONDITION_MESSAGES,
  isBlocking,
  makeStatus,
  parseStatusBytes,
  type PrinterCondition,
  type PrinterStatus,
} from "./printer-status.js";
export { MockHardwareBridge } from "./mock-bridge.js";
export { NetworkHardwareBridge } from "./network-bridge.js";
export { AxonFpidFiscal, type AxonFpidFiscalConfig } from "./axonfpid/fiscal.js";
export { startFakeRt } from "./axonfpid/fake-rt.js";

import { MockHardwareBridge } from "./mock-bridge.js";
import { NetworkHardwareBridge } from "./network-bridge.js";
import { AxonFpidFiscal } from "./axonfpid/fiscal.js";
import type { HardwareBridge, HardwareBridgeConfig } from "./types.js";

/** Stampa come la base (mock o rete), emissione fiscale tramite l'RT. */
function withFiscal(base: HardwareBridge, fiscal: AxonFpidFiscal): HardwareBridge {
  return {
    printEscPos: (...args) => base.printEscPos(...args),
    getPrinterStatus: (...args) => base.getPrinterStatus(...args),
    emitReceipt: (order) => fiscal.emitReceipt(order),
    emitZReport: () => fiscal.emitZReport(),
    openCashDrawer: () => fiscal.openCashDrawer(),
  };
}

/**
 * HARDWARE_BRIDGE_MODE=network instrada i ticket ESC/POS a stampanti di
 * rete reali (vedi NetworkHardwareBridge). Default "mock": nessuna modifica
 * per chi sviluppa senza hardware collegato.
 */
export function createHardwareBridge(config: HardwareBridgeConfig): HardwareBridge {
  const mode = process.env.HARDWARE_BRIDGE_MODE ?? "mock";
  const statusCheck = config.statusCheck ?? process.env.PRINTER_STATUS_CHECK !== "off";
  const base: HardwareBridge =
    mode === "network"
      ? new NetworkHardwareBridge({ ...config, statusCheck })
      : new MockHardwareBridge(config);

  // FISCAL_BRIDGE_MODE=axonfpid: scontrini sulla Hydra II RT via cartella di axonFPiD.
  // Default "mock": nessuna modifica per chi sviluppa senza RT.
  if ((process.env.FISCAL_BRIDGE_MODE ?? "mock") === "axonfpid") {
    const dir = process.env.AXONFPID_DIR;
    if (!dir) throw new Error("FISCAL_BRIDGE_MODE=axonfpid richiede AXONFPID_DIR (cartella di ascolto di axonFPiD)");
    return withFiscal(
      base,
      new AxonFpidFiscal({
        dir,
        timeoutMs: process.env.AXONFPID_TIMEOUT_MS ? Number(process.env.AXONFPID_TIMEOUT_MS) : undefined,
        sf20: {
          identLine: process.env.AXONFPID_IDENT_LINE || undefined,
        },
      }),
    );
  }
  return base;
}
