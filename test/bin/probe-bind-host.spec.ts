// @vitest-environment node
// The launcher's port probes and the server's bind have to be about the SAME address.
//
// They were not, between b696a967 (2026-07-26, the server moved to loopback by default) and
// #1876 — and nothing noticed, because a probe on an address nobody is listening on reports
// "free", which is indistinguishable from a genuinely free port. The consequence was silent:
// the second-instance guard (#611, #653) stopped firing for every default install.
//
// So this pins the agreement rather than either half of it. Same reasoning as the
// PORT_IN_USE_EXIT_CODE contract in test/server/infra/server-exit.spec.ts: a value duplicated
// across `bin/` (plain JS, cannot import the server's TypeScript) and `server/` needs a test
// standing between the two copies, or the next person to move one leaves the other behind.
import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindHostFor } from "../../bin/cli-args.js";
import { BIND_HOST } from "../../server/config/env.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the launcher probes the address the server binds", () => {
  it("agrees with server/config/env.ts on the default", () => {
    expect(bindHostFor({})).toBe(BIND_HOST);
  });

  // BIND_HOST is read once at import, so the widened case cannot be asserted through it without
  // reloading the module. Assert the EXPRESSION instead: both sides must read the same variable,
  // which is what makes the agreement survive someone changing the default.
  it("reads the same variable server/config/env.ts reads", () => {
    const serverEnv = readFileSync(path.join(REPO_ROOT, "server", "config", "env.ts"), "utf8");
    expect(serverEnv, "server/config/env.ts no longer derives BIND_HOST from MULMOTERMINAL_HOST").toMatch(
      /BIND_HOST\s*=\s*process\.env\.MULMOTERMINAL_HOST\s*\|\|\s*"127\.0\.0\.1"/,
    );
    expect(bindHostFor({ MULMOTERMINAL_HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });

  // The regression itself, in one line: the launcher must not be left probing a wildcard.
  it("does not leave a hostless listen in the launcher's probes", () => {
    const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
    const probes = [...launcher.matchAll(/probe\.listen\(([^)]*)\)/g)].map((m) => m[1]);
    expect(probes.length, "bin/mulmoterminal.js no longer probes with a `probe.listen(...)` — #1876's guard moved or was renamed").toBeGreaterThan(0);
    probes.forEach((args) => expect(args, `probe.listen(${args}) names no host, so it binds the :: wildcard — that is #1876`).toContain("BIND_HOST"));
  });
});

// The premise the fix rests on, asserted rather than quoted: a bind collides with a peer on the
// SAME address. That is what makes "probe the address the server will bind" the correct rule, and
// it holds on every platform.
//
// Deliberately NOT asserted here: that a WILDCARD probe fails to see a loopback peer. It does on
// macOS — measured, and it is why #1876 reproduces — but whether a wildcard bind collides with a
// specific address is platform behaviour. Pinning it would paint CI red on an OS where the bug
// simply does not exist, which is how a job becomes one everyone learns to ignore. The fix does
// not depend on it: probing BIND_HOST is right either way.
describe("what a port collision requires (the premise of #1876)", () => {
  // `address()` is `AddressInfo | string | null` — a pipe, or not listening. Neither can happen
  // on the line below, but a guard says which case is expected instead of asserting it away.
  const isNetworkAddress = (a: unknown): a is { port: number } => typeof a === "object" && a !== null && typeof Reflect.get(a, "port") === "number";

  const takePort = (host: string) =>
    new Promise<{ port: number; release: () => void }>((resolve, reject) => {
      const peer = createServer();
      peer.once("error", reject);
      peer.once("listening", () => {
        const address = peer.address();
        if (!isNetworkAddress(address)) return reject(new Error(`expected a network address, got ${JSON.stringify(address)}`));
        resolve({ port: address.port, release: () => peer.close() });
      });
      peer.listen(0, host);
    });

  const canBind = (port: number, host: string) =>
    new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen(port, host);
    });

  it("a probe on the address the peer holds sees it", async () => {
    const peer = await takePort("127.0.0.1");
    try {
      expect(await canBind(peer.port, "127.0.0.1")).toBe(false);
    } finally {
      peer.release();
    }
  });

  it("and reports free once the peer lets go, so it is measuring the peer and not the port", async () => {
    const peer = await takePort("127.0.0.1");
    peer.release();
    await new Promise((r) => setTimeout(r, 50));
    expect(await canBind(peer.port, "127.0.0.1")).toBe(true);
  });
});
