// @vitest-environment node
// Whether a second listener on loopback is needed, and which loopback address it takes.
//
// The whole of #1834 rests on this one decision: get it wrong towards "not needed" and every hook
// and GUI MCP url in the session keeps failing; wrong towards "needed" and the boot tries to bind
// a port it already holds.
import { describe, it, expect, vi } from "vitest";

import {
  loopbackListenPlan,
  startLoopbackListener,
  type BoundAddress,
  type LoopbackListener,
  type PrimaryListener,
} from "../../../server/infra/loopback-listener.js";

describe("loopbackListenPlan", () => {
  it("is not needed for the default bind — nothing changes for an untouched install", () => {
    expect(loopbackListenPlan({ address: "127.0.0.1" })).toBeNull();
  });

  // This used to assert the opposite — "not needed for any of 127.0.0.0/8, which is all
  // loopback" — and the premise was the wrong question. Being loopback is not what matters;
  // answering on 127.0.0.1 is, because guiMcpUrlTemplate and the hooks write that address as a
  // LITERAL. A socket bound to one specific address accepts connections to that address and no
  // other, which is how TCP works rather than a platform quirk: measured on this machine, a
  // server on 192.168.11.12 answers 192.168.11.12 and gives ECONNREFUSED to 127.0.0.1.
  //
  // So a server on 127.0.0.53 leaves every local client unable to reach it at all, and planning
  // no secondary listener is what made that silent. Found by the CI reviewer on #1877.
  it("IS needed for the rest of 127.0.0.0/8, which does not answer for 127.0.0.1", () => {
    for (const address of ["127.0.0.2", "127.0.0.53", "127.1.2.3"]) {
      expect(loopbackListenPlan({ address }), address).toEqual({ address: "127.0.0.1", inUseIsFine: false });
    }
  });

  it("is still not needed for 127.0.0.1 itself, which is the address in question", () => {
    expect(loopbackListenPlan({ address: "127.0.0.1" })).toBeNull();
  });

  it("IS needed for the IPv6 loopback, which does not serve the v4 one", () => {
    // `MULMOTERMINAL_HOST=localhost` resolves to `::1` on a dual-stack machine, and a server there
    // REFUSES a client dialing 127.0.0.1 (both measured) — so the GUI MCP url, which says
    // 127.0.0.1 literally, is unreachable today. This is the second bug #1834 turned up.
    expect(loopbackListenPlan({ address: "::1" })).toEqual({ address: "127.0.0.1", inUseIsFine: false });
  });

  it("needs nothing for the v4 wildcard, which serves the v4 loopback by definition", () => {
    // Not merely "usually": 0.0.0.0 IS the v4 wildcard, and no kernel setting takes loopback out
    // of it. Attempting a bind here would only add a log line to a configuration that works.
    expect(loopbackListenPlan({ address: "0.0.0.0" })).toBeNull();
  });

  it("ATTEMPTS the bind for the v6 wildcard, treating a clash as proof rather than failure", () => {
    // `::` usually accepts v4 too, so the bind is expected to fail — and that failure is the
    // proof. On a kernel with net.ipv6.bindv6only=1 it succeeds instead, which is exactly the host
    // where `::` leaves the fixed 127.0.0.1 urls unreachable (Codex on #1838).
    expect(loopbackListenPlan({ address: "::" })).toEqual({ address: "127.0.0.1", inUseIsFine: true });
  });

  it("IS needed for a specific non-loopback address — the reported case", () => {
    expect(loopbackListenPlan({ address: "192.168.64.1" })).toEqual({ address: "127.0.0.1", inUseIsFine: false });
    expect(loopbackListenPlan({ address: "100.101.102.103" })).toEqual({ address: "127.0.0.1", inUseIsFine: false });
  });

  it("takes the v4 loopback for a v6 bind too, because that is what our callers dial", () => {
    // Not a family match: six of the eight callers write `127.0.0.1` literally and none writes
    // `::1`, so serving `::1` would answer a question nobody asks.
    expect(loopbackListenPlan({ address: "fe80::1" })?.address).toBe("127.0.0.1");
    expect(loopbackListenPlan({ address: "2001:db8::5" })?.address).toBe("127.0.0.1");
  });

  it("says no for a pipe or UNIX socket, which no session url can name", () => {
    expect(loopbackListenPlan("/tmp/mulmoterminal.sock")).toBeNull();
  });

  it("says no when the server is not listening at all", () => {
    expect(loopbackListenPlan(null)).toBeNull();
  });
});

// The effect, not just the decision: whether it binds, and what it does when it cannot.
describe("startLoopbackListener", () => {
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

  it("does not bind anything when loopback is already served", () => {
    const { calls, loopback } = recorder();
    startLoopbackListener(fakeServer({ address: "127.0.0.1" }), loopback, 34567);
    expect(calls).toEqual([]);
  });

  it("binds the v4 loopback on the port the server was given", () => {
    const { calls, loopback } = recorder();
    startLoopbackListener(fakeServer({ address: "192.168.64.1" }), loopback, "34567");
    expect(calls).toEqual([{ address: "127.0.0.1", port: 34567 }]);
  });

  it("warns and carries on when the extra bind fails, rather than taking down the boot", () => {
    // The operator's own address is already listening by now; refusing to run because the EXTRA
    // one collided would turn a degraded setup into no setup at all.
    const { handlers, loopback } = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListener(fakeServer({ address: "192.168.64.1" }), loopback, 34567);
    expect(handlers).toHaveLength(1);
    expect(() => handlers[0]?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }))).not.toThrow();
    // Names the symptom the operator would otherwise have to diagnose from failing hooks.
    expect(warn.mock.calls[0]?.[0]).toContain("hooks");
    warn.mockRestore();
  });
});

describe("startLoopbackListener under a v6 wildcard primary", () => {
  const wildcard = (): PrimaryListener => ({ address: () => ({ address: "::" }) });

  const recorder = () => {
    const handlers: ((err: NodeJS.ErrnoException) => void)[] = [];
    const loopback: LoopbackListener = { listen: () => {}, once: (_event, handler) => handlers.push(handler) };
    return { handlers, loopback };
  };

  it("says nothing when the port is already taken — that IS the wildcard covering loopback", () => {
    const { handlers, loopback } = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListener(wildcard(), loopback, 34567);
    handlers[0]?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still warns about a failure that is NOT the expected clash", () => {
    const { handlers, loopback } = recorder();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    startLoopbackListener(wildcard(), loopback, 34567);
    handlers[0]?.(Object.assign(new Error("denied"), { code: "EACCES" }));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
