import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeMac, parseArpTable, rediscoverPrinters, resetDiscoveryForTest } from "./printer-discovery.js";

describe("tabella ARP", () => {
  it("Windows (arp -a)", () => {
    const t = parseArpTable(`
Interfaccia: 192.168.1.64 --- 0x7
  Indirizzo Internet    Indirizzo fisico      Tipo
  192.168.1.1           a4-91-b1-0c-22-10     dinamico
  192.168.1.57          00-26-ab-4f-9a-01     dinamico
  192.168.1.255         ff-ff-ff-ff-ff-ff     statico`);
    expect(t.get("192.168.1.57")).toBe("00:26:ab:4f:9a:01");
    expect(t.has("192.168.1.255")).toBe(false);
  });
  it("macOS (zeri iniziali omessi)", () => {
    const t = parseArpTable("? (192.168.123.100) at 0:26:ab:4f:9a:1 on en7 ifscope [ethernet]");
    expect(t.get("192.168.123.100")).toBe("00:26:ab:4f:9a:01");
  });
  it("Linux (/proc/net/arp)", () => {
    const t = parseArpTable(`IP address       HW type     Flags       HW address            Mask     Device
192.168.1.57     0x1         0x2         00:26:ab:4f:9a:01     *        eth0`);
    expect(t.get("192.168.1.57")).toBe("00:26:ab:4f:9a:01");
  });
  it("MAC non validi scartati", () => {
    expect(normalizeMac("00:00:00:00:00:00")).toBeNull();
    expect(normalizeMac("zz:11:22:33:44:55")).toBeNull();
  });
});

let dir: string;
let db: EdgeDatabase;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-disc-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  resetDiscoveryForTest();
  const now = new Date().toISOString();
  for (const [id, name, wc] of [["c", "Cucina", "CUCINA"], ["b", "Bar", "BAR"]] as const) {
    db.insert(printers).values({ id, name, workCenter: wc, host: "192.168.1.50", port: 9100, enabled: true, macAddress: "00:26:ab:4f:9a:01", createdAt: now }).run();
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("stampante che cambia indirizzo", () => {
  it("ritrovata per MAC: aggiornati tutti i reparti che la usano", async () => {
    const all = db.select().from(printers).all();
    const res = await rediscoverPrinters(db, [all[0]!], {
      scan: async () => ["192.168.1.57", "192.168.1.80"],
      arp: async () => new Map([["192.168.1.57", "00:26:ab:4f:9a:01"], ["192.168.1.80", "11:22:33:44:55:66"]]),
    });
    expect(res).toEqual([{ printerName: "Cucina", from: "192.168.1.50", to: "192.168.1.57" }]);
    expect(db.select().from(printers).all().map((p) => p.host)).toEqual(["192.168.1.57", "192.168.1.57"]);
  });

  it("MAC non trovato sulla rete: nessuna modifica", async () => {
    const all = db.select().from(printers).all();
    const res = await rediscoverPrinters(db, all, {
      scan: async () => ["192.168.1.80"],
      arp: async () => new Map([["192.168.1.80", "11:22:33:44:55:66"]]),
    });
    expect(res).toEqual([]);
    expect(db.select().from(printers).all()[0]!.host).toBe("192.168.1.50");
  });

  it("al massimo una ricerca ogni 2 minuti", async () => {
    const all = db.select().from(printers).all();
    let scans = 0;
    const deps = { scan: async () => { scans++; return []; }, arp: async () => new Map<string, string>() };
    await rediscoverPrinters(db, all, { ...deps, now: 1_000_000 });
    await rediscoverPrinters(db, all, { ...deps, now: 1_060_000 });
    expect(scans).toBe(1);
  });
});
