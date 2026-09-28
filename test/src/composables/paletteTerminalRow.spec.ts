import { describe, it, expect } from "vitest";
import { paletteTerminalOf } from "../../../src/composables/paletteTerminalRow";

// #2446. A grid cell as the palette lists it: found by its path, memo and summary.
const row = (over: Partial<Parameters<typeof paletteTerminalOf>[0]> = {}) => ({
  uid: 3,
  cwd: "/home/me/ss/llm/mulmoterminal4",
  agent: "claude",
  memo: null,
  summary: null,
  ...over,
});

describe("paletteTerminalOf", () => {
  it("names the terminal by its home-relative path", () => {
    expect(paletteTerminalOf(row(), "/home/me")).toMatchObject({ uid: 3, path: "~/ss/llm/mulmoterminal4" });
  });

  it("says the memo first, then the summary, then the agent", () => {
    expect(paletteTerminalOf(row({ memo: "release", summary: "Fix tabs" }), null)?.detail).toBe("release");
    expect(paletteTerminalOf(row({ summary: "Fix tabs" }), null)?.detail).toBe("Fix tabs");
    expect(paletteTerminalOf(row(), null)?.detail).toBe("claude");
    expect(paletteTerminalOf(row({ agent: null }), null)?.detail).toBe("");
  });

  it("is found by the memo and the summary too", () => {
    expect(paletteTerminalOf(row({ memo: "release", summary: "Fix tabs" }), null)?.keywords).toBe("release Fix tabs");
  });

  it("lists no cell that has no directory yet", () => {
    expect(paletteTerminalOf(row({ cwd: null }), null)).toBeNull();
  });
});
