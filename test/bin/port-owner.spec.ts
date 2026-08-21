// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createServer } from "node:http";

import { portOwnerCommand, parsePortOwners, portOwners, type PortOwnerRunner } from "../../bin/port-owner.js";

// A stand-in for the lookup command, typed by the module's own runner contract — so these cases
// need no cast, and a change to that contract fails here rather than silently passing.
const runner =
  (fail: Parameters<Parameters<PortOwnerRunner>[3]>[0], stdout = ""): PortOwnerRunner =>
  (_file, _args, _options, cb) =>
    cb(fail, stdout);

describe("portOwnerCommand", () => {
  it("narrows to LISTENING sockets on POSIX", () => {
    // Without it, a browser tab CONNECTED to the port is reported as an owner too, and `stop`
    // would then refuse the real server because the pid set contains a stranger.
    const { file, args } = portOwnerCommand(34567, "darwin");
    expect(file).toBe("lsof");
    expect(args).toContain("-sTCP:LISTEN");
    expect(args).toContain("tcp:34567");
  });

  it("skips the lookups that make lsof slow", () => {
    // -n (no reverse DNS) and -P (no service names): measured at 115ms with, 850ms without.
    expect(portOwnerCommand(34567, "linux").args).toContain("-nP");
  });

  it("asks PowerShell for OwningProcess on Windows, narrowed the same way", () => {
    const { file, args } = portOwnerCommand(34567, "win32");
    expect(file).toBe("powershell.exe");
    expect(args.join(" ")).toContain("Get-NetTCPConnection -LocalPort 34567 -State Listen");
    expect(args.join(" ")).toContain("OwningProcess");
    // No profile, or a user's PowerShell profile runs on every stop.
    expect(args).toContain("-NoProfile");
  });
});

describe("parsePortOwners", () => {
  it("reads one pid per line", () => {
    expect(parsePortOwners("1234\n5678\n")).toEqual([1234, 5678]);
  });

  it("tolerates the padding PowerShell adds and CRLF", () => {
    expect(parsePortOwners("  1234  \r\n  5678  \r\n")).toEqual([1234, 5678]);
  });

  it("yields nothing for empty or non-numeric output", () => {
    expect(parsePortOwners("")).toEqual([]);
    expect(parsePortOwners("\n\n")).toEqual([]);
    expect(parsePortOwners("Get-NetTCPConnection : not recognized")).toEqual([]);
  });
});

describe("portOwners", () => {
  // null and [] are DIFFERENT answers: [] is "the OS says nobody", null is "could not ask".
  // Collapsing them turns "cannot check" into "not ours", which would refuse to stop a real server.
  it("returns null when the tool is not installed", async () => {
    const run = runner(Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" }));
    expect(await portOwners(34567, { run, platform: "linux" })).toBeNull();
  });

  it("returns null when the lookup had to be killed", async () => {
    const run = runner(Object.assign(new Error("timed out"), { killed: true }));
    expect(await portOwners(34567, { run, platform: "darwin" })).toBeNull();
  });

  it("returns [] — an answer — when the tool exits non-zero with no match", async () => {
    // lsof exits 1 when nothing matches. That is "nobody is listening", not a failure.
    const run = runner(Object.assign(new Error("exit 1"), { code: 1 }));
    expect(await portOwners(34567, { run, platform: "darwin" })).toEqual([]);
  });

  it("names the real owner of a real socket", async () => {
    // Against the actual OS, because the whole point of this module is that the kernel answers.
    const server = createServer(() => {});
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    try {
      const owners = await portOwners(addr.port);
      // Skipped rather than failed where the tool is absent — that case is covered above, and a
      // runner without lsof must not turn into a red build over an environment fact.
      if (owners === null) return;
      expect(owners).toContain(process.pid);
    } finally {
      server.close();
    }
  });
});
