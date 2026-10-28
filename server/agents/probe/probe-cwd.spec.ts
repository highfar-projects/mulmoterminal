// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { probeCwd } from "./probe-cwd";

describe("probeCwd (#3200)", () => {
  it("is a folder under MulmoTerminal's own state directory, never the workspace", () => {
    expect(probeCwd(path.join("/home", "me", ".mulmoterminal"))).toBe(path.join("/home", "me", ".mulmoterminal", "probe"));
  });

  // The home directory is the one place Claude Code keeps no trust answer, so the folder must sit
  // below it rather than be it — whatever the state directory is named.
  it("is never the state directory itself", () => {
    const stateDir = path.join("/home", "me", ".mulmoterminal");
    expect(probeCwd(stateDir)).not.toBe(stateDir);
    expect(path.dirname(probeCwd(stateDir))).toBe(stateDir);
  });
});
