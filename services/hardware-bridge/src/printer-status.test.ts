import { createServer, type Server } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NetworkHardwareBridge } from "./network-bridge.js";
import { parseStatusBytes } from "./printer-status.js";

/** Byte di stato "tutto ok": bit 1 e 4 fissi a 1. */
const OK = 0x12;

describe("parseStatusBytes", () => {
  it("riconosce stampante pronta", () => {
    expect(parseStatusBytes(Buffer.from([OK, OK])).condition).toBe("OK");
  });
  it("riconosce coperchio aperto", () => {
    expect(parseStatusBytes(Buffer.from([OK | 0x04, OK])).condition).toBe("COVER_OPEN");
  });
  it("riconosce carta finita", () => {
    expect(parseStatusBytes(Buffer.from([OK, OK | 0x60])).condition).toBe("PAPER_OUT");
  });
  it("riconosce carta in esaurimento", () => {
    const s = parseStatusBytes(Buffer.from([OK, OK | 0x0c]));
    expect(s.condition).toBe("PAPER_NEAR_END");
    expect(s.paperNearEnd).toBe(true);
  });
  it("risposta assente o non valida: stato sconosciuto", () => {
    expect(parseStatusBytes(Buffer.alloc(0)).condition).toBe("UNKNOWN");
    expect(parseStatusBytes(Buffer.from([0xff, 0x00])).condition).toBe("UNKNOWN");
  });
});

/** Finta stampante Epson: risponde a DLE EOT con i byte indicati e registra il resto. */
function fakeEpson(reply: number[]) {
  const received: Buffer[] = [];
  const server: Server = createServer((socket) => {
    socket.on("data", (chunk) => {
      received.push(chunk);
      if (chunk.includes(Buffer.from([0x10, 0x04]))) socket.write(Buffer.from(reply));
    });
    socket.on("error", () => {});
  });
  return new Promise<{ port: number; received: Buffer[]; close: () => void }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: (server.address() as { port: number }).port,
        received,
        close: () => server.close(),
      }),
    ),
  );
}

describe("NetworkHardwareBridge con lettura stato", () => {
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  it("non invia la stampa se la carta è finita", async () => {
    const printer = await fakeEpson([OK, OK | 0x60]);
    close = printer.close;
    const bridge = new NetworkHardwareBridge({ printDir: await mkdtemp(join(tmpdir(), "pg-")) });
    const result = await bridge.printEscPos("cucina", Buffer.from("COMANDA\n"), "t", {
      host: "127.0.0.1",
      port: printer.port,
    });
    expect(result.success).toBe(false);
    expect(result.condition).toBe("PAPER_OUT");
    await new Promise((r) => setTimeout(r, 30));
    expect(Buffer.concat(printer.received).toString()).not.toContain("COMANDA");
  });

  it("stampa se la stampante è pronta", async () => {
    const printer = await fakeEpson([OK, OK]);
    close = printer.close;
    const bridge = new NetworkHardwareBridge({ printDir: await mkdtemp(join(tmpdir(), "pg-")) });
    const result = await bridge.printEscPos("cucina", Buffer.from("COMANDA\n"), "t", {
      host: "127.0.0.1",
      port: printer.port,
    });
    expect(result.success).toBe(true);
    expect(result.condition).toBe("OK");
    await new Promise((r) => setTimeout(r, 30));
    expect(Buffer.concat(printer.received).toString()).toContain("COMANDA");
  });

  it("legge lo stato senza stampare", async () => {
    const printer = await fakeEpson([OK | 0x04, OK]);
    close = printer.close;
    const bridge = new NetworkHardwareBridge({ printDir: await mkdtemp(join(tmpdir(), "pg-")) });
    const status = await bridge.getPrinterStatus({ host: "127.0.0.1", port: printer.port });
    expect(status.condition).toBe("COVER_OPEN");
    expect(status.supported).toBe(true);
  });

  it("stampante irraggiungibile", async () => {
    const bridge = new NetworkHardwareBridge({ printDir: await mkdtemp(join(tmpdir(), "pg-")) });
    const status = await bridge.getPrinterStatus({ host: "127.0.0.1", port: 1 });
    expect(status.condition).toBe("UNREACHABLE");
  });
});
