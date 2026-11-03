import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, devices, type EdgeDatabase } from "@pizzaguys/edge-db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNetworkStatus, buildOf, worstLevel } from "./network-status.js";

let dir: string;
let db: EdgeDatabase;
const savedPairing = process.env.DEVICE_PAIRING;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-net-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
});
afterEach(() => {
  if (savedPairing === undefined) delete process.env.DEVICE_PAIRING;
  else process.env.DEVICE_PAIRING = savedPairing;
  rmSync(dir, { recursive: true, force: true });
});

describe("stato rete", () => {
  it("livello peggiore", () => {
    expect(worstLevel(["ok", "info"])).toBe("info");
    expect(worstLevel(["ok", "error", "warning"])).toBe("error");
    expect(worstLevel([])).toBe("ok");
  });

  it("legge la build dalla versione del client", () => {
    expect(buildOf("handheld@0.1.5+abc1234")).toBe("0.1.5+abc1234");
    expect(buildOf("handheld-0.3.0")).toBeNull();
    expect(buildOf(null)).toBeNull();
  });

  it("abbinamento disattivato: voce rossa con cosa fare", () => {
    process.env.DEVICE_PAIRING = "off";
    const s = buildNetworkStatus(db);
    const pairing = s.items.find((i) => i.id === "pairing")!;
    expect(pairing.level).toBe("error");
    expect(pairing.action).toMatch(/DEVICE_PAIRING/);
    expect(s.overall).toBe("error");
  });

  it("palmare sparito da poco: avviso; spento da ore: solo informazione", () => {
    const now = Date.now();
    const add = (id: string, minutesAgo: number) =>
      db.insert(devices).values({
        id, name: id, kind: "handheld", tokenHash: id, pairedAt: new Date(now).toISOString(),
        lastSeenAt: new Date(now - minutesAgo * 60000).toISOString(),
      }).run();
    add("Palmare Marco", 5);
    add("Palmare Sara", 600);
    const s = buildNetworkStatus(db, now);
    expect(s.items.find((i) => i.label === "Palmare Marco")!.level).toBe("warning");
    expect(s.items.find((i) => i.label === "Palmare Sara")!.level).toBe("info");
  });

  it("ogni voce non verde dice cosa fare", () => {
    process.env.DEVICE_PAIRING = "off";
    const s = buildNetworkStatus(db);
    for (const i of s.items.filter((x) => x.level === "error" || x.level === "warning")) {
      expect(i.action, i.label).toBeTruthy();
    }
  });
});
