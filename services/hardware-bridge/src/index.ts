export type {
  FiscalOrderInput,
  HardwareBridge,
  HardwareBridgeConfig,
  PrintResult,
  PrintTarget,
  ReceiptResult,
  ZReportResult,
} from "./types.js";
export { MockHardwareBridge } from "./mock-bridge.js";
export { NetworkHardwareBridge } from "./network-bridge.js";

import { MockHardwareBridge } from "./mock-bridge.js";
import { NetworkHardwareBridge } from "./network-bridge.js";
import type { HardwareBridge, HardwareBridgeConfig } from "./types.js";

/**
 * HARDWARE_BRIDGE_MODE=network instrada i ticket ESC/POS a stampanti di
 * rete reali (vedi NetworkHardwareBridge). Default "mock": nessuna modifica
 * per chi sviluppa senza hardware collegato.
 */
export function createHardwareBridge(config: HardwareBridgeConfig): HardwareBridge {
  const mode = process.env.HARDWARE_BRIDGE_MODE ?? "mock";
  return mode === "network" ? new NetworkHardwareBridge(config) : new MockHardwareBridge(config);
}
