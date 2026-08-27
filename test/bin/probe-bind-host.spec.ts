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
import { createServer, type Server } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindHostFor, launcherReachHost, launcherUrl, probeFailureIsPortInUse } from "../../bin/cli-args.js";
import { BIND_HOST } from "../../server/config/env.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the launcher probes the address the server binds", () => {
  // The contract, and it holds in ANY environment: given the same env, the launcher and the
  // server pick the same address. The first version of this asserted `bindHostFor({})` against
  // `BIND_HOST` — a fallback against a live value — so a runner that exports MULMOTERMINAL_HOST
  // reddened it with no defect present. Reproduced: with MULMOTERMINAL_HOST=0.0.0.0 it failed
  // "expected '127.0.0.1' to be '0.0.0.0'". Flagged by CodeRabbit and the CI Codex.
  it("chooses the same address the server chose, whatever this process's environment is", () => {
    expect(bindHostFor(process.env)).toBe(BIND_HOST);
  });

  // The DEFAULT, pinned against the server's SOURCE rather than its runtime value, so no live
  // environment can reach this assertion at all.
  it("falls back to the same default server/config/env.ts falls back to", () => {
    const serverEnv = readFileSync(path.join(REPO_ROOT, "server", "config", "env.ts"), "utf8");
    expect(serverEnv, "server/config/env.ts no longer derives BIND_HOST from MULMOTERMINAL_HOST").toMatch(
      /BIND_HOST\s*=\s*process\.env\.MULMOTERMINAL_HOST\s*\|\|\s*"127\.0\.0\.1"/,
    );
    expect(bindHostFor({})).toBe("127.0.0.1");
  });

  // And the configured case, which the source regex above says the server treats the same way.
  it("follows a widened bind rather than pinning loopback", () => {
    expect(bindHostFor({ MULMOTERMINAL_HOST: "0.0.0.0" })).toBe("0.0.0.0");
  });

  // The regression itself, in one line: the launcher must not be left probing a wildcard.
  it("does not leave a hostless listen in the launcher's probes", () => {
    const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
    const probes = [...launcher.matchAll(/probe\.listen\(([^)]*)\)/g)].map((m) => m[1]);
    expect(probes.length, "bin/mulmoterminal.js no longer probes with a `probe.listen(...)` — #1876's guard moved or was renamed").toBeGreaterThan(0);
    probes.forEach((args) => expect(args, `probe.listen(${args}) names no host, so it binds the :: wildcard — that is #1876`).toContain("BIND_HOST"));
  });

  // ...and neither may the readiness poll, which is the same question asked a third way. A
  // hardcoded loopback there is what let a stranger's 200 print our ready banner.
  it("does not hardcode an address in the readiness poll", () => {
    const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
    expect(launcher, "bin/mulmoterminal.js no longer calls waitUntilReady — #1876's third site moved or was renamed").toContain("waitUntilReady(");
    // Matched as an EXPRESSION, not a layout: the first version of this guard keyed on
    // `waitUntilReady(port,` and went red the moment prettier wrapped the call across lines. A
    // guard that a formatter can break is a guard that gets deleted rather than fixed.
    expect(launcher, "the readiness poll must be given the host BIND_HOST resolves to, not left on its loopback default").toMatch(
      /host:\s*launcherReachHost\(BIND_HOST\)/,
    );
  });
});

// Naming a host on the probe made a whole class of errno reachable that a hostless bind never
// produced, and folding them into "the port is in use" is a message that sends the operator
// after a process that does not exist. Found during Claude review of this PR, not flagged by
// Codex, which had already returned LGTM.
describe("what a failed probe actually tells you", () => {
  it("EADDRINUSE means the port is taken", () => {
    expect(probeFailureIsPortInUse({ code: "EADDRINUSE" })).toBe(true);
  });

  // Each of these became reachable only because the probe now names a host: an address that is
  // not on this machine, a name that does not resolve, a privileged port. Measured on macOS:
  // listen(port,'10.255.255.1') is EADDRNOTAVAIL and listen(port,'nonsense-host') is ENOTFOUND.
  it.each(["EADDRNOTAVAIL", "ENOTFOUND", "EACCES", "EINVAL"])("%s means the probe could not ask, not that the port is taken", (code) => {
    expect(probeFailureIsPortInUse({ code })).toBe(false);
  });

  // Defensive rather than reachable: `error` always carries an Error here. A rule that throws on
  // the shape it is handed would turn a bad launch into a crashed launcher.
  it.each([null, undefined, {}])("treats %o as 'could not ask'", (err) => {
    expect(probeFailureIsPortInUse(err)).toBe(false);
  });
});

// The launcher's THIRD "which address does this port mean" site, after the two probes: the
// readiness poll and the URL it prints. It hardcoded 127.0.0.1 until the CI Codex found that a
// stranger on loopback answers it while our server binds elsewhere — measured end to end: the
// banner said "MulmoTerminal is ready -> http://localhost:34660" and that URL served
// "NOT MULMOTERMINAL".
describe("the address the launcher uses to reach the server it started", () => {
  it("is the bind address itself when the operator named one", () => {
    expect(launcherReachHost("192.168.11.12")).toBe("192.168.11.12");
  });

  it("is loopback for the default bind", () => {
    expect(launcherReachHost("127.0.0.1")).toBe("127.0.0.1");
  });

  // A wildcard is not an address you connect to; it maps to the loopback its OWN family serves.
  it("maps the v4 wildcard to v4 loopback", () => {
    expect(launcherReachHost("0.0.0.0")).toBe("127.0.0.1");
  });

  // `::` maps to `::1`, NOT 127.0.0.1, and the reason is the whole bug: a v4 socket bound to
  // 127.0.0.1 is more specific than our dual-stack listener and wins the connection, so polling
  // 127.0.0.1 could be answered by the very stranger we must not mistake for ourselves.
  it("maps the v6 wildcard to v6 loopback, which a v4 socket cannot shadow", () => {
    expect(launcherReachHost("::")).toBe("::1");
  });

  describe("and the URL it prints for that address", () => {
    it.each(["127.0.0.1", "0.0.0.0", "::"])("says localhost for %s, which is friendlier and true", (host) => {
      expect(launcherUrl(host, 34567)).toBe("http://localhost:34567");
    });

    // Asserted through URL rather than against a literal string: `http://<a LAN address>` trips
    // sonarjs/no-clear-text-protocols, and this says the thing that matters anyway — which host
    // and port the launcher will send the user to.
    it("names the real address when localhost would not reach it", () => {
      const url = new URL(launcherUrl("192.168.11.12", 34567));
      expect(url.hostname).toBe("192.168.11.12");
      expect(url.port).toBe("34567");
      expect(url.protocol).toBe("http:");
    });

    // `http://::1:34567` is not a URL. Nothing reaches this today (`::` maps to localhost above),
    // but a bracket bug surfaces as a browser that silently opens nothing — and measured, the
    // `URL.hostname` setter does not throw on an unbracketed v6 literal, it IGNORES it and keeps
    // the previous host. So this pins the output, not the mechanism.
    it("brackets an IPv6 literal", () => {
      // `hostname` round-trips WITH the brackets, so this pins the serialized form without
      // spelling a clear-text URL out as a literal.
      expect(new URL(launcherUrl("fd00::1", 34567)).hostname).toBe("[fd00::1]");
    });
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

  // `release` RESOLVES WHEN THE PORT IS ACTUALLY FREE. It used to be a bare `peer.close()` — which
  // returns immediately — followed by a fixed 50ms sleep, so on a slow runner the next bind could
  // race the close and report a collision that was the test's own peer. Flagged by CodeRabbit and
  // the CI Codex; the repo has hit fixed-delay flakiness on Windows CI before.
  const closed = (server: Server) => new Promise<void>((done) => server.close(() => done()));

  const takePort = (host: string) =>
    new Promise<{ port: number; release: () => Promise<void> }>((resolve, reject) => {
      const peer = createServer();
      peer.once("error", reject);
      peer.once("listening", () => {
        const address = peer.address();
        if (!isNetworkAddress(address)) return reject(new Error(`expected a network address, got ${JSON.stringify(address)}`));
        resolve({ port: address.port, release: () => closed(peer) });
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
      await peer.release();
    }
  });

  it("and reports free once the peer lets go, so it is measuring the peer and not the port", async () => {
    const peer = await takePort("127.0.0.1");
    await peer.release();
    expect(await canBind(peer.port, "127.0.0.1")).toBe(true);
  });
});
