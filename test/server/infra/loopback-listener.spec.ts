// @vitest-environment node
// Whether a second listener on loopback is needed, and which loopback address it takes.
//
// The whole of #1834 rests on this one decision: get it wrong towards "not needed" and every hook
// and GUI MCP url in the session keeps failing; wrong towards "needed" and the boot tries to bind
// a port it already holds.
import { describe, it, expect, vi } from "vitest";

import {
  loopbackListenAddress,
  startLoopbackListener,
  type BoundAddress,
  type LoopbackListener,
  type PrimaryListener,
} from "../../../server/infra/loopback-listener.js";

describe("loopbackListenAddress", () => {
  it("is not needed for the default bind — nothing changes for an untouched install", () => {
    expect(loopbackListenAddress({ address: "127.0.0.1" })).toBeNull();
  });

  it("is not needed for any of 127.0.0.0/8, which is all loopback", () => {
    for (const address of ["127.0.0.1", "127.0.0.53", "127.1.2.3"]) {
      expect(loopbackListenAddress({ address })).toBeNull();
    }
  });

  it("IS needed for the IPv6 loopback, which does not serve the v4 one", () => {
    // `MULMOTERMINAL_HOST=localhost` resolves to `::1` on a dual-stack machine, and a server there
    // REFUSES a client dialing 127.0.0.1 (both measured) — so the GUI MCP url, which says
    // 127.0.0.1 literally, is unreachable today. This is the second bug #1834 turned up.
    expect(loopbackListenAddress({ address: "::1" })).toBe("127.0.0.1");
  });

  it("is not needed for a wildcard bind, which already serves loopback", () => {
    // The case that makes "just widen the bind" wrong as a fix: 0.0.0.0 serves loopback fine, and
    // a second listener on the same port would collide with the wildcard that already holds it.
    expect(loopbackListenAddress({ address: "0.0.0.0" })).toBeNull();
    expect(loopbackListenAddress({ address: "::" })).toBeNull();
  });

  it("IS needed for a specific non-loopback address — the reported case", () => {
    expect(loopbackListenAddress({ address: "192.168.64.1" })).toBe("127.0.0.1");
    expect(loopbackListenAddress({ address: "100.101.102.103" })).toBe("127.0.0.1");
  });

  it("takes the v4 loopback for a v6 bind too, because that is what our callers dial", () => {
    // Not a family match: six of the eight callers write `127.0.0.1` literally and none writes
    // `::1`, so serving `::1` would answer a question nobody asks.
    expect(loopbackListenAddress({ address: "fe80::1" })).toBe("127.0.0.1");
    expect(loopbackListenAddress({ address: "2001:db8::5" })).toBe("127.0.0.1");
  });

  it("says no for a pipe or UNIX socket, which no session url can name", () => {
    expect(loopbackListenAddress("/tmp/mulmoterminal.sock")).toBeNull();
  });

  it("says no when the server is not listening at all", () => {
    expect(loopbackListenAddress(null)).toBeNull();
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
