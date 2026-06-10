export type {
  FiscalOrderInput,
  HardwareBridge,
  HardwareBridgeConfig,
  PrintResult,
  ReceiptResult,
  ZReportResult,
} from "./types.js";
export { MockHardwareBridge } from "./mock-bridge.js";

import { MockHardwareBridge } from "./mock-bridge.js";
import type { HardwareBridge, HardwareBridgeConfig } from "./types.js";

export function createHardwareBridge(config: HardwareBridgeConfig): HardwareBridge {
  return new MockHardwareBridge(config);
}
