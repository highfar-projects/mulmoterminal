import { describe, it, expect } from "vitest";
import { cellForPaletteStart, paletteStartId, paletteStarts } from "../../../src/composables/paletteStarts";
import { cellForPanelStart } from "../../../src/components/launchCell";
import type { CustomAgent } from "../../../common/customAgents";

const NEMO: CustomAgent = { id: "nemo", label: "Nemotron", command: "ollama launch claude --", agent: "claude" };
const HTOP = { label: "htop", command: "htop" };

describe("paletteStarts", () => {
  it("offers the Agent Picker's options in its order, then each launcher", () => {
    const ids = paletteStarts([NEMO], [HTOP]).map(paletteStartId);
    expect(ids[0]).toBe("agent:claude");
    expect(ids.slice(-3)).toEqual(["agent:custom:nemo", "agent:shell", "launcher:0"]);
  });

  it("has no launcher rows and no custom agents when none are configured", () => {
    const starts = paletteStarts([], []);
    expect(starts.every((start) => start.kind === "agent")).toBe(true);
    expect(starts.map(paletteStartId)).not.toContain("agent:custom:nemo");
  });

  it("numbers launchers by their place in the list, which is what the server runs them by", () => {
    const starts = paletteStarts([], [HTOP, { label: "top", command: "top" }]).filter((start) => start.kind === "launcher");
    expect(starts.map(paletteStartId)).toEqual(["launcher:0", "launcher:1"]);
  });
});

describe("cellForPaletteStart", () => {
  it("builds an agent the way the launch panel does", () => {
    const starts = paletteStarts([NEMO], []);
    starts.forEach((start) => {
      if (start.kind !== "agent") return;
      expect(cellForPaletteStart(start, "/w/app")).toEqual(cellForPanelStart({ dir: "/w/app", pick: start.pick, choice: null, account: null }, "/w/app"));
    });
  });

  it("starts a custom agent as itself, not as Claude", () => {
    const [custom] = paletteStarts([NEMO], []).filter((start) => paletteStartId(start) === "agent:custom:nemo");
    expect(custom && cellForPaletteStart(custom, "/w/app")).toMatchObject({ cwd: "/w/app", customAgent: "nemo", autoStart: true });
  });

  it("runs a launcher in the directory, as its chip does", () => {
    const [, launcher] = paletteStarts([], [{ label: "top", command: "top" }, HTOP]).filter((start) => start.kind === "launcher");
    expect(launcher && cellForPaletteStart(launcher, "/w/app")).toEqual({ session: null, cwd: "/w/app", launcher: { index: 1, label: "htop" } });
  });
});
