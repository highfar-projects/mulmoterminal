// @vitest-environment node
// Which loopback addresses this server must take for itself, beyond whatever the primary bound.
//
// Two decisions ride on this, and they fail in different directions:
//   - #1834 — get `127.0.0.1` wrong towards "not needed" and every hook and GUI MCP url in the
//     session keeps failing; wrong towards "needed" and the boot tries to bind a port it holds.
//   - #1893 — get `::1` wrong towards "not needed" and anything on this machine can take the
//     address the user's browser resolves `localhost` to FIRST (measured on Chrome), and answer
//     for our origin with the settings that origin holds.
import { describe, it, expect, vi } from "vitest";

import {
  loopbackListenPlans,
  startLoopbackListeners,
  type BoundAddress,
  type LoopbackListener,
  type LoopbackPlan,
  type PrimaryListener,
} from "../../../server/infra/loopback-listener.js";

const addressesFor = (bound: BoundAddress): string[] => loopbackListenPlans(bound).map((p) => p.address);
const planFor = (bound: BoundAddress, address: string): LoopbackPlan | undefined => loopbackListenPlans(bound).find((p) => p.address === address);

describe("loopbackListenPlans", () => {
  // The default bind. It answers for 127.0.0.1 by being it, and answers for nothing on v6 — which
  // is the whole of #1893, since this is what almost every install runs.
  it("takes the v6 loopback for the default bind, and nothing else", () => {
    expect(addressesFor({ address: "127.0.0.1" })).toEqual(["::1"]);
  });

  it("takes BOTH for the rest of 127.0.0.0/8, which answers for neither", () => {
    // A server bound to 127.0.0.2 refuses a client dialing 127.0.0.1 exactly as a `::1` one does.
    ["127.0.0.2", "127.1.2.3"].forEach((address) => expect(addressesFor({ address }), address).toEqual(["127.0.0.1", "::1"]));
  });

  it("takes only the v4 loopback for a v6 loopback bind, which already serves ::1", () => {
    expect(addressesFor({ address: "::1" })).toEqual(["127.0.0.1"]);
  });

  it("takes only the v6 loopback for the v4 wildcard, which serves the v4 one by definition", () => {
    expect(addressesFor({ address: "0.0.0.0" })).toEqual(["::1"]);
  });

  // `::` covers the v6 loopback for certain — bindv6only decides whether a v6 socket ALSO takes
  // v4, never whether it takes v6 — while its v4 coverage is the thing that has to be attempted.
  it("takes nothing for the v6 wildcard beyond the v4 attempt, whose clash is proof rather than failure", () => {
    expect(addressesFor({ address: "::" })).toEqual(["127.0.0.1"]);
    expect(planFor({ address: "::" }, "127.0.0.1")?.inUseProvesPrimary).toBe(true);
  });

  it("takes both for a specific non-loopback address — the reported case", () => {
    ["192.168.64.1", "100.101.102.103", "fe80::1", "2001:db8::5"].forEach((address) =>
      expect(addressesFor({ address }), address).toEqual(["127.0.0.1", "::1"]),
    );
  });

  // A clash on `::1` can only be somebody else: every bind that could already hold it produces no
  // v6 plan at all. Treating it as "fine" would silence the one warning #1893 exists to raise.
  it("never excuses a clash on the v6 loopback, whatever the bind", () => {
    ["127.0.0.1", "0.0.0.0", "192.168.64.1", "127.0.0.2"].forEach((address) => expect(planFor({ address }, "::1")?.inUseProvesPrimary, address).toBe(false));
  });

  // The two listeners fail in ways that look identical in a log and are nothing alike to read.
  it("labels each plan with what it is for, so the warning can name the right symptom", () => {
    expect(planFor({ address: "192.168.64.1" }, "127.0.0.1")?.reason).toBe("sessions");
    expect(planFor({ address: "192.168.64.1" }, "::1")?.reason).toBe("browser");
  });

  // index.ts creates exactly two spares and startLoopbackListeners hands plan i to spare i.
  it("never asks for more spares than index.ts builds", () => {
    ["127.0.0.1", "127.0.0.2", "0.0.0.0", "::", "::1", "192.168.64.1", "fe80::1"].forEach((address) =>
      expect(loopbackListenPlans({ address }).length, address).toBeLessThanOrEqual(2),
    );
  });

  it("says no for a pipe or UNIX socket, which no session url can name", () => {
    expect(loopbackListenPlans("/tmp/mulmoterminal.sock")).toEqual([]);
  });

  it("says no when the server is not listening at all", () => {
    expect(loopbackListenPlans(null)).toEqual([]);
  });
});

describe("startLoopbackListeners", () => {
  const fakeServer = (address: BoundAddress): PrimaryListener => ({ address: () => address });

  const recorder = () => {
    const calls: { address: string; port: number }[] = [];
    const handlers: ((err: NodeJS.ErrnoException) => void)[] = [];
    const loopback: LoopbackListener = {
      listen: (port, address, onListening) => {
        calls.push({ address, port });
        onListening();
      },
      once: (_event, handler) => handlers.push(handler),
    };
    return { calls, handlers, loopback };
  };

  it("binds nothing when the primary already answers for both loopbacks", () => {
    const a = recorder();
    const b = recorder();
    startLoopbackListeners(fakeServer("/tmp/mulmoterminal.sock"), [a.loopback, b.loopback], 34567);
    expect([...a.calls, ...b.calls]).toEqual([]);
  });

  it("gives each plan its own spare, on the port the server was given", () => {
    const a = recorder();
    const b = recorder();
    startLoopbackListeners(fakeServer({ address: "192.168.64.1" }), [a.loopback, b.loopback], "34567");
    expect(a.calls).toEqual([{ address: "127.0.0.1", port: 34567 }]);
    expect(b.calls).toEqual([{ address: "::1", port: 34567 }]);
  });

  it("takes only the v6 loopback for the default bind, leaving the other spare unused", () => {
    const a = recorder();
    const b = recorder();
    startLoopbackListeners(fakeServer({ address: "127.0.0.1" }), [a.loopback, b.loopback], 34567);
    expect(a.calls).toEqual([{ address: "::1", port: 34567 }]);
    expect(b.calls).toEqual([]);
  });

  it("warns and carries on when the extra bind fails, rather than taking down the boot", () => {
    // The operator's own address is already listening by now; refusing to run because the EXTRA
    // one collided would turn a degraded setup into no setup at all.
    const a = recorder();
    const b = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(fakeServer({ address: "192.168.64.1" }), [a.loopback, b.loopback], 34567);
    expect(() => a.handlers[0]?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }))).not.toThrow();
    // Names the symptom the operator would otherwise have to diagnose from failing hooks.
    expect(warn.mock.calls[0]?.[0]).toContain("hooks");
    warn.mockRestore();
  });

  // The v6 failure is the one a user meets as "my grid is empty", so it must not borrow the v4
  // text about hooks — the two are diagnosed from opposite ends.
  it("explains a v6 failure in terms of the browser, not of hooks", () => {
    const a = recorder();
    const b = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(fakeServer({ address: "127.0.0.1" }), [a.loopback, b.loopback], 34567);
    a.handlers[0]?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }));
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toContain("localhost");
    expect(text).not.toContain("hooks");
    warn.mockRestore();
  });

  // A machine with no IPv6 lands here, and it is not a problem there: `localhost` is v4-only, so
  // nothing is at stake and there is no rival to report. This asserted a warning until Codex
  // pointed out that the warning is an accusation against a stranger who does not exist (#1903).
  it("carries on SILENTLY when the v6 loopback is not an address this machine has", () => {
    const a = recorder();
    const b = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(fakeServer({ address: "127.0.0.1" }), [a.loopback, b.loopback], 34567);
    expect(() => a.handlers[0]?.(Object.assign(new Error("unavailable"), { code: "EADDRNOTAVAIL" }))).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // Being handed too few spares is a wiring mistake, and the failure it would otherwise cause is
  // a listener that silently never starts.
  it("says so rather than dropping a plan when there are not enough spares", () => {
    const a = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(fakeServer({ address: "192.168.64.1" }), [a.loopback], 34567);
    expect(a.calls).toEqual([{ address: "127.0.0.1", port: 34567 }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("::1");
    warn.mockRestore();
  });
});

describe("startLoopbackListeners under a v6 wildcard primary", () => {
  const wildcard = (): PrimaryListener => ({ address: () => ({ address: "::" }) });

  const recorder = () => {
    const handlers: ((err: NodeJS.ErrnoException) => void)[] = [];
    const loopback: LoopbackListener = { listen: () => {}, once: (_event, handler) => handlers.push(handler) };
    return { handlers, loopback };
  };

  it("says nothing when the port is already taken — that IS the wildcard covering loopback", () => {
    const a = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(wildcard(), [a.loopback, recorder().loopback], 34567);
    a.handlers[0]?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still warns about a failure that is NOT the expected clash", () => {
    const a = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListeners(wildcard(), [a.loopback, recorder().loopback], 34567);
    a.handlers[0]?.(Object.assign(new Error("denied"), { code: "EACCES" }));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

// The v4 half of the outcome exists only to decide what URL to print when `::1` was lost.
describe("the outcome it reports", () => {
  const recorder = (succeed: boolean, code = "EADDRINUSE") => {
    let onError: ((err: NodeJS.ErrnoException) => void) | undefined;
    const loopback: LoopbackListener = {
      once: (_event, handler) => {
        onError = handler;
        return undefined;
      },
      listen: (_port, _address, onListening) => {
        if (succeed) onListening();
        else onError?.(Object.assign(new Error(code), { code }));
        return undefined;
      },
    };
    return loopback;
  };

  it("counts an address the primary already serves as ours", async () => {
    const outcome = await startLoopbackListeners({ address: () => ({ address: "::" }) }, [recorder(true), recorder(true)], 34567);
    expect(outcome).toEqual({ v6: "ours", v4: "ours" });
  });

  it("reports each half separately when only one bind lost", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // A LAN bind plans both; the first spare takes 127.0.0.1 and the second loses ::1.
    const outcome = await startLoopbackListeners({ address: () => ({ address: "192.168.64.1" }) }, [recorder(true), recorder(false)], 34567);
    expect(outcome).toEqual({ v6: "taken", v4: "ours" });
    warn.mockRestore();
  });

  // Only EADDRINUSE says somebody else is there. An IPv4-only host fails the `::1` bind with
  // EADDRNOTAVAIL, and calling that "taken" accuses a stranger who does not exist (#1903).
  it("calls an address this machine does not have `absent`, not `taken`", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outcome = await startLoopbackListeners({ address: () => ({ address: "127.0.0.1" }) }, [recorder(false, "EADDRNOTAVAIL")], 34567);
    expect(outcome).toEqual({ v6: "absent", v4: "ours" });
    // And says nothing: there is no rival to tell the operator about.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats an unsupported address family the same way", async () => {
    const outcome = await startLoopbackListeners({ address: () => ({ address: "127.0.0.1" }) }, [recorder(false, "EAFNOSUPPORT")], 34567);
    expect(outcome.v6).toBe("absent");
  });

  // Anything it cannot classify stays conservative — a refusal we do not understand might still
  // be an address somebody else can bind.
  it("keeps an unrecognised failure as taken", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outcome = await startLoopbackListeners({ address: () => ({ address: "127.0.0.1" }) }, [recorder(false, "EACCES")], 34567);
    expect(outcome.v6).toBe("taken");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

// A `::` primary is dual-stack on most kernels, so its 127.0.0.1 auxiliary clashes with the
// primary ITSELF. Reading that as a rival suppressed `localhost` for a server that owns both
// loopbacks (Codex/CodeRabbit, #1903) — and macOS hides it, because there the bind succeeds.
describe("a clash that proves the primary already covers the address", () => {
  const clashing = (): LoopbackListener => {
    let onError: ((err: NodeJS.ErrnoException) => void) | undefined;
    return {
      once: (_event, handler) => {
        onError = handler;
        return undefined;
      },
      listen: () => {
        onError?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }));
        return undefined;
      },
    };
  };

  it("counts as ours, not as taken", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const outcome = await startLoopbackListeners({ address: () => ({ address: "::" }) }, [clashing(), clashing()], 34567);
    expect(outcome).toEqual({ v4: "ours", v6: "ours" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
