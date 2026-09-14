// @vitest-environment node
// The launcher → server port channel. It is argv rather than an env var because the server
// hands its own environment to every PTY, so a port set there reaches every terminal in every
// cell — which made a dev server started in a cell try to take MulmoTerminal's own port
// (#1857). `MULMOTERMINAL_PORT` cannot stand in: that one is given to PTYs on purpose.
import { describe, it, expect } from "vitest";
import { parsePort, portFromArgv } from "../../../server/config/port-from-argv";

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

// `parsePort` is the same rule, reached by the OTHER channel. It was extracted because
// `process.env.PORT` used to skip validation entirely — and this value is interpolated into shell
// commands written to disk for an agent to run later (server/session/hook-settings.ts's curl,
// server/agents/copilot-hooks-file.ts's hook file), so an unusable value was not a bad bind, it was
// whatever the string said (Codex review on #2063).
describe("parsePort", () => {
  it("refuses anything that would carry shell syntax into a hook command", () => {
    for (const bad of ["34567$(touch /tmp/pwned)", "34567;id", "34567 ", "34567`id`", "$PORT", "34567\n", ""]) {
      expect(parsePort(bad)).toBeNull();
    }
  });

  it("refuses a number that is not a usable port", () => {
    for (const bad of ["0", "-1", "65536", "3.5", "0x8567", "08567", " 34567"]) expect(parsePort(bad)).toBeNull();
  });

  it("refuses an absent value", () => {
    expect(parsePort(undefined)).toBeNull();
  });

  it("takes a plain integer in range", () => {
    expect(parsePort("34567")).toBe(34567);
    expect(parsePort("1")).toBe(1);
    expect(parsePort("65535")).toBe(65535);
  });
});
