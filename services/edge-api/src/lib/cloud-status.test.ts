import { afterEach, describe, expect, it } from "vitest";
import { CloudError } from "./cloud.js";
import { getCloudStatus, recordCloudFailure, recordCloudOk, resetCloudStatusForTest } from "./cloud-status.js";

afterEach(() => resetCloudStatusForTest());

describe("stato Cloud", () => {
  it("token rifiutato: nessun falso OK e avviso immediato", () => {
    recordCloudOk();
    const okAt = getCloudStatus().lastOkAt;
    recordCloudFailure(new CloudError("rifiutato", "UNAUTHORIZED", 401));
    const s = getCloudStatus();
    expect(s.state).toBe("UNAUTHORIZED");
    expect(s.lastOkAt).toBe(okAt);
    expect(s.level).toBe("warning");
    expect(s.message).toBe("rifiutato");
  });

  it("Cloud irraggiungibile: soglie 5 min / 2 ore / 24 ore", () => {
    recordCloudFailure(new CloudError("giù", "UNREACHABLE"));
    const since = new Date(getCloudStatus().failingSince!).getTime();
    expect(getCloudStatus(since + 60_000).level).toBe("ok");
    expect(getCloudStatus(since + 6 * 60_000).level).toBe("info");
    expect(getCloudStatus(since + 3 * 3600_000).level).toBe("warning");
    expect(getCloudStatus(since + 25 * 3600_000).level).toBe("critical");
  });

  it("ritorno del Cloud: segnala il recupero e azzera l'errore", () => {
    recordCloudFailure(new CloudError("giù", "UNREACHABLE"));
    expect(recordCloudOk()).toBe(true);
    const s = getCloudStatus();
    expect(s.state).toBe("OK");
    expect(s.failingSince).toBeNull();
    expect(recordCloudOk()).toBe(false);
  });
});
