import { describe, expect, it } from "vitest";
import { printerHostSchema, updatePrinterSchema } from "./edge.js";

describe("printerHostSchema", () => {
  it.each(["192.168.123.100", "10.0.0.1", "127.0.0.1", "stampante-cucina", "printer.local"])(
    "accetta %s",
    (host) => {
      expect(printerHostSchema.safeParse(host).success).toBe(true);
    },
  );

  it.each(["", "192.168.1", "192.168.1.256", "192.168.1.1.1", "http://192.168.1.1", "ip stampante"])(
    "rifiuta %s",
    (host) => {
      expect(printerHostSchema.safeParse(host).success).toBe(false);
    },
  );

  it("toglie gli spazi ai lati", () => {
    expect(printerHostSchema.parse(" 192.168.1.200 ")).toBe("192.168.1.200");
  });
});

describe("updatePrinterSchema", () => {
  it("accetta solo IP e porta", () => {
    expect(updatePrinterSchema.safeParse({ host: "192.168.1.200", port: 9100 }).success).toBe(true);
  });

  it("rifiuta porte fuori intervallo", () => {
    expect(updatePrinterSchema.safeParse({ port: 0 }).success).toBe(false);
    expect(updatePrinterSchema.safeParse({ port: 70000 }).success).toBe(false);
  });
});
