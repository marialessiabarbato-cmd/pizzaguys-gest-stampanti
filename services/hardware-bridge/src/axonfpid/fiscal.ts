import { createMockReceipt } from "@pizzaguys/fiscal";
import type { FiscalOrderInput, ReceiptResult, ZReportResult } from "../types.js";
import { FolderTransport, type FolderTransportConfig } from "./folder-transport.js";
import { describeFailure } from "./response.js";
import { buildReceiptDocument, DEFAULT_SF20_CONFIG, Sf20BuildError, type Sf20Config } from "./sf20.js";

export interface AxonFpidFiscalConfig extends FolderTransportConfig {
  sf20?: Partial<Sf20Config>;
}

/**
 * Emissione fiscale tramite axonFPiD (Hydra II RT), trasporto a cartella.
 *
 * Abilitato: scontrino (comandi SF20 ricavati dagli esempi, vedi sf20.ts).
 * Bloccati finché non si conoscono i comandi veri, per non indovinare su un
 * dispositivo fiscale: chiusura Z, apertura cassetto, fattura, annullo/reso.
 * La Z in particolare è irreversibile e consuma un azzeramento di memoria.
 */
export class AxonFpidFiscal {
  private readonly transport: FolderTransport;
  private readonly sf20: Sf20Config;
  private drawerWarned = false;

  constructor(config: AxonFpidFiscalConfig) {
    this.transport = new FolderTransport(config);
    this.sf20 = { ...DEFAULT_SF20_CONFIG, ...config.sf20 };
  }

  async emitReceipt(order: FiscalOrderInput): Promise<ReceiptResult> {
    let document: string;
    try {
      document = buildReceiptDocument(order, this.sf20);
    } catch (err) {
      if (err instanceof Sf20BuildError) return { success: false, error: err.message };
      throw err;
    }

    let result;
    try {
      result = await this.transport.submit(document);
    } catch (err) {
      return {
        success: false,
        error: `Impossibile scrivere nella cartella di axonFPiD: ${err instanceof Error ? err.message : "errore"}`,
      };
    }

    if (result.kind === "timeout") {
      return {
        success: false,
        error:
          `Nessuna risposta dalla stampante fiscale (documento ${result.fileId}). ` +
          "NON ripetere l'incasso prima di aver controllato sull'RT se lo scontrino è uscito.",
      };
    }
    if (!result.response.ok) {
      return { success: false, error: describeFailure(result.response) };
    }

    // Il tipo di ritorno è ancora MockReceipt: l'id riporta il documento RT.
    const receipt = createMockReceipt({
      locationId: order.locationId,
      tableId: order.tableId,
      paymentMethod: order.paymentMethod,
      documentType: order.documentType,
      lines: order.lines,
      amountReceived: order.amountReceived,
      paymentSplits: order.paymentSplits,
    });
    return { success: true, receipt: { ...receipt, id: `RT-${result.fileId}` } };
  }

  async emitZReport(): Promise<ZReportResult> {
    return {
      success: false,
      error:
        "Chiusura fiscale dall'RT non ancora abilitata in HuBbì: eseguila dal pannello dell'RT finché non è confermata",
    };
  }

  async openCashDrawer(): Promise<void> {
    if (!this.drawerWarned) {
      this.drawerWarned = true;
      console.warn("[axonfpid] apertura cassetto non ancora abilitata: nessun comando inviato");
    }
  }
}
