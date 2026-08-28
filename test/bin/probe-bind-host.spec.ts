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
import { bindHostFor, companionHostsFor, launcherReachHost, launcherUrl, probeFailureIsPortInUse } from "../../bin/cli-args.js";
import { boundAddress } from "../../server/infra/loopback.js";
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
    // `host` is the parameter canBind takes; BIND_HOST is what findEphemeralPort still asks the
    // OS with. Either names an address; a bare `probe.listen(port)` names none, and that is the bug.
    probes.forEach((args) => expect(args, `probe.listen(${args}) names no host, so it binds the :: wildcard — that is #1876`).toMatch(/host|BIND_HOST/));
  });

  // The port is free only when it is free on every address probeHostsFor names — a wildcard that
  // checked only itself is how a stranger ended up behind the ready banner.
  it("requires every needed address to be free, not just the first", () => {
    const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
    expect(launcher, "the companions must be derived from what the kernel bound, not from BIND_HOST").toMatch(/companionHostsFor\(primary\.address\)/);
    expect(launcher, "isPortFree must fail on the FIRST companion that is taken").toMatch(/if \(!\(await canBind\(port, host\)\)\.free\) return/);
  });

  // ...and neither may the readiness poll, which is the same question asked a third way. A
  // hardcoded loopback there is what let a stranger's 200 print our ready banner.
  it("does not hardcode an address in the readiness poll", () => {
    const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
    expect(launcher, "bin/mulmoterminal.js no longer calls waitUntilReady — #1876's third site moved or was renamed").toContain("waitUntilReady(");
    // Matched as an EXPRESSION, not a layout: the first version of this guard keyed on
    // `waitUntilReady(port,` and went red the moment prettier wrapped the call across lines. A
    // guard that a formatter can break is a guard that gets deleted rather than fixed.
    // Was `launcherReachHost(BIND_HOST)`, then `launcherReachHost(reachHost)`, and is now the
    // concrete host itself because callers resolve before calling. What must never come back is
    // the poll left on its hardcoded loopback default, so THAT is what this asserts — the shape
    // the guard survives, rather than whichever spelling the call site happens to have today.
    expect(launcher, "the readiness poll must be given a host, not left on its loopback default").toMatch(/host:\s*reachHost/);
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

  // THE INVERSION, and the assertion that makes it fail closed. Four rounds each found a
  // different spelling a guess got wrong, so the rule stopped enumerating bad forms and now
  // permits only what the platform itself calls an IP. Everything else is null — REPORTED, not
  // guessed at. A future spelling nobody imagined arrives as null, which is a missing banner and
  // a sentence explaining it, rather than a confident poll of a stranger.
  it.each(["localhost", "foo.local", "127.1", "127.000.000.001", "", "LOCALHOST"])("cannot know what %o resolves to, and says so with null", (host) => {
    expect(launcherReachHost(host)).toBeNull();
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

  // The URL names the CONCRETE address, never `localhost`. Printing `localhost` throws away the
  // precision the reach host just established: measured on macOS, `localhost` resolves to BOTH
  // `::1` and `127.0.0.1`, so a browser can open the very process the poll avoided. Flagged by
  // CodeRabbit as a Major on the first head it reviewed after the readiness fix.
  describe("and the URL it prints for that address", () => {
    // launcherUrl now takes the CONCRETE address launcherReachHost produced, so these compose the
    // two the way the launcher does.
    const urlFor = (bindHost: string) => {
      const reach = launcherReachHost(bindHost);
      expect(reach, `launcherReachHost(${bindHost}) should be nameable`).not.toBeNull();
      return launcherUrl(String(reach), 34567);
    };

    it("never says localhost, whatever the bind", () => {
      ["127.0.0.1", "0.0.0.0", "::", "192.168.11.12", "fd00::1"].forEach((host) => expect(urlFor(host)).not.toContain("localhost"));
    });

    it("names v4 loopback for the default and for the v4 wildcard", () => {
      ["127.0.0.1", "0.0.0.0"].forEach((host) => expect(new URL(urlFor(host)).hostname).toBe("127.0.0.1"));
    });

    // The one that matters most: `::` polls `::1`, so the URL has to say `::1` too, or the two
    // disagree about which process was checked.
    it("names v6 loopback for the v6 wildcard, matching what the poll checked", () => {
      expect(new URL(urlFor("::")).hostname).toBe("[::1]");
    });

    // Asserted through URL rather than against a literal string: `http://<a LAN address>` trips
    // sonarjs/no-clear-text-protocols, and this says the thing that matters anyway — which host
    // and port the launcher will send the user to.
    it("names the real address when localhost would not reach it", () => {
      const url = new URL(urlFor("192.168.11.12"));
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

// A wildcard and a specific address COEXIST, so a wildcard bind alone never proves the port is
// ours. Measured with a stranger on 127.0.0.1:34720: listen(34720,"0.0.0.0") succeeds while
// listen(34720,"127.0.0.1") is EADDRINUSE — and the banner then served the stranger. The fifth
// finding on this rule, and the last address the launcher was still taking on faith.
// Asked about the address the KERNEL SAYS the bind landed on, never about the string that was
// typed. Eight review rounds went to spellings — `::` vs `0:0:0:0:0:0:0:0`, `::1` vs its long
// form, `localhost`, `127.1` — and a host string has no last case. Measured: the kernel reports
// `::` for all three v6 wildcard spellings, `::1` for `localhost`, `127.0.0.1` for `127.1`. So
// the comparisons this rests on are exact: the kernel's OUTPUT vocabulary is finite even though
// its input vocabulary is not.
// `127.0.0.1` is required for EVERY bind, and arriving there took four rounds of me arguing the
// opposite. The claim was that a specific non-loopback bind serves OTHER machines, so a degraded
// local listener costs only convenience. It mischaracterises the bind: MulmoTerminal runs its
// PTYs on THIS machine whatever address it listens on, and those sessions' GUI MCP dials
// `http://127.0.0.1:<port>` as a literal. A LAN bind changes who can open the browser, not where
// the sessions live.
//
// Asked about the address the KERNEL reports, never the string that was typed — measured, it
// returns `::` for every v6 wildcard spelling and `::1` for `localhost`, so these comparisons are
// exact rather than a list.
describe("the companions a bound address implies", () => {
  it.each(["0.0.0.0", "::1", "127.0.0.2", "192.168.11.12", "10.0.0.5"])("requires the v4 loopback GUI MCP dials, for %s", (address) => {
    expect(companionHostsFor(address)).toEqual(["127.0.0.1"]);
  });

  // Plus `::1` for the v6 wildcard: that is the address the launcher polls and prints for it, and
  // a specific `::1` socket is MORE specific than a dual-stack bind, so it would win the
  // connection.
  it("adds the v6 loopback for a v6 wildcard, which is what it polls and prints", () => {
    expect(companionHostsFor("::")).toEqual(["::1", "127.0.0.1"]);
  });

  it("asks for nothing when the bind already IS that address", () => {
    expect(companionHostsFor("127.0.0.1")).toEqual([]);
  });

  // The literal is duplicated into bin/ because that is plain JS and cannot import the server's
  // TypeScript. Pinned against its source the way PORT_IN_USE_EXIT_CODE is.
  it("agrees with gui-mcp-registration.ts about the address those clients dial", () => {
    const registration = readFileSync(path.join(REPO_ROOT, "server", "infra", "gui-mcp-registration.ts"), "utf8");
    expect(registration, "guiMcpUrlTemplate no longer dials 127.0.0.1 by literal — companionHostsFor's reason moved").toMatch(/http:\/\/127\.0\.0\.1:/);
  });

  // The premise the whole design rests on, asserted rather than quoted.
  it("is only ever handed a normalised address, because the kernel resolves the spelling", async () => {
    const bound = (host: string) =>
      new Promise<string>((resolve, reject) => {
        const s = createServer();
        s.once("error", reject);
        s.once("listening", () => {
          const a = s.address();
          const address = a !== null && typeof a !== "string" ? a.address : "";
          s.close(() => resolve(address));
        });
        s.listen(0, host);
      });
    expect(await bound("0:0:0:0:0:0:0:0")).toBe("::");
    expect(await bound("0:0:0:0:0:0:0:1")).toBe("::1");
  });

  // `127.1` normalises on macOS and Linux and is REJECTED on Windows — `getaddrinfo ENOTFOUND`,
  // which CI caught when this file asserted it as though it were universal. The production path
  // does not care: ENOTFOUND is not EADDRINUSE, so the probe reports "could not ask", no
  // companions are checked, and the server binds for real and reports the actual errno.
  it("is not asked to normalise a spelling the platform rejects — that path reports instead", () => {
    expect(probeFailureIsPortInUse({ code: "ENOTFOUND" })).toBe(false);
    expect(companionHostsFor("127.0.0.1")).toEqual([]);
  });
});

// THE INVERSION. Three review rounds each found a different spelling of BIND_HOST that a guess
// gets wrong — `::` vs `::1`, `localhost` resolving per platform, a printed `localhost` a browser
// re-resolves. A host string has no last case, so the launcher stopped classifying the REQUESTED
// string and now asks the child what it actually bound. server/infra/loopback.ts had already
// argued exactly this for its own question: "classifying the requested string cannot be made
// right … asking after the fact answers all of them, because the kernel has already resolved
// whatever was typed."
describe("the address the child reports, which is what the launcher now polls", () => {
  it("is the address the OS says it bound", () => {
    expect(boundAddress({ address: "::1" })).toBe("::1");
    expect(boundAddress({ address: "192.168.11.12" })).toBe("192.168.11.12");
  });

  // A pipe or a UNIX socket is not something a client dials, and null is "not listening yet".
  // Both mean "no address to poll", not "poll the empty string".
  it.each([null, "/tmp/some.sock"])("is null for %o, which a client cannot dial", (address) => {
    expect(boundAddress(address)).toBeNull();
  });
});

describe("the launcher asks the child rather than classifying BIND_HOST", () => {
  const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");

  // Without an ipc channel the server's announcement is a no-op — its own comment in
  // server/index.ts says so — and the launcher is back to guessing.
  it("opens an ipc channel to the server it spawns", () => {
    expect(launcher, "the server's { type: 'listening' } message needs a channel to arrive on").toMatch(/stdio:\s*\[[^\]]*"ipc"[^\]]*\]/);
  });

  // Two independent single-expression assertions, deliberately NOT one regex spanning both. A
  // multi-line shape has been broken twice in this loop — once by prettier rewrapping the call,
  // once by a refactor renaming the argument — and each time the guard went red for a reason that
  // was not a defect. A guard that keeps crying wolf is a guard someone deletes.
  it("resolves the address the child reported, rather than trusting the string", () => {
    expect(launcher).toMatch(/launcherReachHost\(msg\.address\)/);
  });

  it("starts the readiness check from that resolved address", () => {
    expect(launcher).toMatch(/beginReady\(reported\)/);
  });

  // The fallback prefers the address the PROBE learned from the kernel, and never passes a raw
  // BIND_HOST to the poll — that is the round-5 P1, where a slow boot polled an unresolved
  // `localhost`. Two single-expression assertions, for the reason given above.
  it("prefers the address the probe learned from the kernel", () => {
    expect(launcher).toMatch(/launcherReachHost\(probedAddress\)/);
  });

  it("never hands the raw BIND_HOST to the readiness poll", () => {
    expect(launcher, "a raw beginReady(BIND_HOST) is the round-5 P1 coming back").not.toMatch(/beginReady\(BIND_HOST\)/);
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
