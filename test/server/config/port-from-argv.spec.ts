// @vitest-environment node
// The launcher → server port channel. It is argv rather than an env var because the server
// hands its own environment to every PTY, so a port set there reaches every terminal in every
// cell — which made a dev server started in a cell try to take MulmoTerminal's own port
// (#1857). `MULMOTERMINAL_PORT` cannot stand in: that one is given to PTYs on purpose.
import { describe, it, expect } from "vitest";
import { portFromArgv } from "../../../server/config/port-from-argv";

// The shape node actually hands over: execPath, script, then the script's own arguments.
const argv = (...rest: string[]) => ["/usr/bin/node", "/pkg/server/index.ts", ...rest];

describe("portFromArgv", () => {
  it("reads the port the launcher passed", () => {
    expect(portFromArgv(argv("--port", "34601"))).toBe(34601);
  });

  // null, not the default: the caller falls through to PORT and only then to 34567, and
  // deciding the default here would take the dev channel away.
  it("is null when no --port was passed", () => {
    expect(portFromArgv(argv())).toBeNull();
    expect(portFromArgv(argv("--other", "x"))).toBeNull();
  });

  it.each([1, 80, 1024, 65535])("accepts %i", (value) => {
    expect(portFromArgv(argv("--port", String(value)))).toBe(value);
  });

  // parseInt stops at the first non-digit, so "80x" would otherwise bind port 80.
  it.each(["0", "65536", "-1", "80x", "3000.5", "0300", "+3000", " 3000", "0x1f90", ""])("refuses %o", (value) => {
    expect(portFromArgv(argv("--port", value))).toBeNull();
  });

  it("refuses a --port at the very end, with no value after it", () => {
    expect(portFromArgv(argv("--port"))).toBeNull();
  });

  // Otherwise "--port --cwd /tmp" would bind whatever "--cwd" parsed to.
  it("refuses the next flag as a value", () => {
    expect(portFromArgv(argv("--port", "--cwd", "/tmp"))).toBeNull();
  });
});
