import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMockReceipt } from "@pizzaguys/fiscal";
import type {
  FiscalOrderInput,
  HardwareBridge,
  HardwareBridgeConfig,
  PrintResult,
  ReceiptResult,
  ZReportResult,
} from "./types.js";

export class MockHardwareBridge implements HardwareBridge {
  private zCounter = 1;

  constructor(private readonly config: HardwareBridgeConfig) {}

  async printEscPos(
    printerId: string,
    payload: Buffer,
    label = "ticket",
  ): Promise<PrintResult> {
    try {
      await mkdir(this.config.printDir, { recursive: true });
      const filename = `${Date.now()}-${printerId}-${label}.escpos`;
      const filePath = join(this.config.printDir, filename);
      await writeFile(filePath, payload);
      return { success: true, printerId, filePath };
    } catch (err) {
      return {
        success: false,
        printerId,
        error: err instanceof Error ? err.message : "Print failed",
      };
    }
  }

  async emitReceipt(order: FiscalOrderInput): Promise<ReceiptResult> {
    const receipt = createMockReceipt({
      locationId: order.locationId,
      tableId: order.tableId,
      paymentMethod: order.paymentMethod,
      documentType: order.documentType,
      lines: order.lines,
      amountReceived: order.amountReceived,
    });
    return { success: true, receipt };
  }

  async emitZReport(): Promise<ZReportResult> {
    const zNumber = this.zCounter++;
    await mkdir(this.config.printDir, { recursive: true });
    const filePath = join(this.config.printDir, `z-report-${zNumber}.txt`);
    await writeFile(
      filePath,
      `MOCK Z-REPORT #${zNumber}\n${new Date().toISOString()}\n`,
    );
    return { success: true, zNumber };
  }

  async openCashDrawer(): Promise<void> {
    await mkdir(this.config.printDir, { recursive: true });
    const filePath = join(this.config.printDir, `${Date.now()}-drawer-kick.txt`);
    await writeFile(filePath, "DRAWER KICK 24V (mock)\n");
  }
}
