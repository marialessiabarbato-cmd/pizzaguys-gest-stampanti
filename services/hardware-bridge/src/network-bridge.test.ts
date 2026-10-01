import { createServer } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NetworkHardwareBridge } from "./network-bridge.js";

describe("NetworkHardwareBridge", () => {
  let printDir = "";

  afterEach(async () => {
    printDir = "";
  });

  it("senza target di rete si comporta come il mock (file su disco)", async () => {
    printDir = await mkdtemp(join(tmpdir(), "pg-print-"));
    const bridge = new NetworkHardwareBridge({ printDir });
    const result = await bridge.printEscPos("kitchen", Buffer.from("TEST\n"), "test");
    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
  });

  it("restituisce un errore controllato se la stampante non risponde", async () => {
    printDir = await mkdtemp(join(tmpdir(), "pg-print-"));
    const bridge = new NetworkHardwareBridge({ printDir });
    const result = await bridge.printEscPos("kitchen", Buffer.from("TEST\n"), "test", {
      host: "127.0.0.1",
      port: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("invia il payload via TCP a una stampante di rete reale", async () => {
    const received: Buffer[] = [];
    const server = createServer((socket) => {
      socket.on("data", (chunk) => received.push(chunk));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;

    printDir = await mkdtemp(join(tmpdir(), "pg-print-"));
    const bridge = new NetworkHardwareBridge({ printDir });
    const result = await bridge.printEscPos("kitchen", Buffer.from("TEST\n"), "test", {
      host: "127.0.0.1",
      port,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.success).toBe(true);
    expect(Buffer.concat(received).toString()).toContain("TEST");
    server.close();
  });
});
