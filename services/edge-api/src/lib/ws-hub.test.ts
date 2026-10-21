import { afterEach, describe, expect, it, vi } from "vitest";
import { addWsClient, identifyWsClient, listConnectedDevices, removeWsClient, stopWsPingLoopForTest, touchWsClient, type WsClient } from "./ws-hub.js";

function fakeClient() {
  let pong: (() => void) | undefined;
  const c: WsClient & { pongNow: () => void } = {
    readyState: 1,
    send: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: (_e, l) => {
      pong = l;
    },
    pongNow: () => pong?.(),
  };
  return c;
}

afterEach(() => {
  stopWsPingLoopForTest();
  vi.useRealTimers();
});

describe("hub WebSocket", () => {
  it("registra il device dall'handshake", () => {
    const c = fakeClient();
    addWsClient(c, "192.168.1.50");
    identifyWsClient(c, { deviceId: "handheld-1", deviceKind: "handheld", clientVersion: "handheld-0.3.0" });
    const d = listConnectedDevices().find((x) => x.deviceId === "handheld-1");
    expect(d?.remoteAddress).toBe("192.168.1.50");
    expect(d?.deviceKind).toBe("handheld");
    removeWsClient(c);
    expect(listConnectedDevices().find((x) => x.deviceId === "handheld-1")).toBeUndefined();
  });

  it("chiude i collegamenti che non rispondono al ping", () => {
    stopWsPingLoopForTest();
    vi.useFakeTimers();
    const dead = fakeClient();
    const live = fakeClient();
    addWsClient(dead);
    addWsClient(live);
    identifyWsClient(dead, { deviceId: "dead" });
    identifyWsClient(live, { deviceId: "live" });
    vi.advanceTimersByTime(15_000); // primo ping
    live.pongNow();
    touchWsClient(live);
    vi.advanceTimersByTime(15_000); // dead non ha risposto
    expect(dead.terminate).toHaveBeenCalled();
    expect(live.terminate).not.toHaveBeenCalled();
    const ids = listConnectedDevices().map((d) => d.deviceId);
    expect(ids).toContain("live");
    expect(ids).not.toContain("dead");
    removeWsClient(live);
  });
});
