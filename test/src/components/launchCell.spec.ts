// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CELL_FOR_AGENT, cellForAgent, cellForPick } from "../../../src/components/launchCell";
import { LAUNCH_AGENTS } from "../../../common/launchAgent";
import { customAgentPick } from "../../../common/customAgents";

const CWD = "/home/me/proj";

describe("cellForAgent", () => {
  it("covers every launch agent", () => {
    expect(Object.keys(CELL_FOR_AGENT).sort()).toEqual([...LAUNCH_AGENTS].sort());
  });

  // `autoStart` is the difference between a cell that RUNS and one that shows the empty launcher
  // under the agent's name (#1535). A shell is the exception: its launcher runs on sight.
  it("marks every agent cell autoStart, and the shell cell not", () => {
    LAUNCH_AGENTS.filter((a) => a !== "shell").forEach((agent) => {
      expect(cellForAgent(CWD, agent)).toMatchObject({ session: null, cwd: CWD, autoStart: true });
    });
    expect(cellForAgent(CWD, "shell").autoStart).toBeUndefined();
    expect(cellForAgent(CWD, "shell").launcher).toBeDefined();
  });

  // Claude is the ABSENT case, not `agent: "claude"` — only an absent key survives the JSON a
  // persisted cell round-trips through (gridTabs.ts).
  it("leaves `agent` absent for claude and sets it for the others", () => {
    expect("agent" in cellForAgent(CWD, "claude")).toBe(false);
    expect(cellForAgent(CWD, "codex").agent).toBe("codex");
    expect(cellForAgent(CWD, "muse").agent).toBe("muse");
  });

  it("falls back to a shell when no agent is named", () => {
    expect(cellForAgent(CWD, undefined).launcher).toBeDefined();
  });
});

describe("cellForPick", () => {
  it("answers a built-in pick exactly as cellForAgent does", () => {
    LAUNCH_AGENTS.forEach((agent) => {
      expect(cellForPick(CWD, agent)).toEqual(cellForAgent(CWD, agent));
    });
  });

  // The whole reason this function exists: a custom agent is a WRAPPER, so the cell has to carry
  // which command line starts it AND whose argv is appended. Losing the first is what made the
  // launch panel unable to start a custom agent the in-cell form could.
  it("carries a custom agent as `customAgent`, keeping `agent` absent for a claude wrapper", () => {
    const made = cellForPick(CWD, customAgentPick("kimi_k3"));
    expect(made).toMatchObject({ session: null, cwd: CWD, customAgent: "kimi_k3", autoStart: true });
    expect("agent" in made).toBe(false);
  });

  it("treats a malformed custom pick as no agent rather than a custom one", () => {
    // `custom:` with an id the validator rejects must not become customAgent: "" — a cell naming
    // no configured entry would launch nothing and say nothing about why.
    const made = cellForPick(CWD, "custom:NOT VALID");
    expect(made.customAgent).toBeUndefined();
    expect(made.launcher).toBeDefined(); // fell back to a shell, the same as an unnamed pick
  });

  it("falls back to a shell when nothing is picked", () => {
    expect(cellForPick(CWD, undefined).launcher).toBeDefined();
  });

  // `""` is falsy, so an autoStart cell built from it passes `isOccupied` but never starts —
  // TerminalCell guards its mount-time launch on `initialCwd`. Null has to survive as null and let
  // the server pick its own default, which is what the in-cell form did.
  it("keeps a null directory null rather than coercing it to an empty string", () => {
    expect(cellForPick(null, "claude").cwd).toBeNull();
    expect(cellForPick(null, "shell").cwd).toBeNull();
  });

  // Null is no more startable than `""` — TerminalCell's mount guard is
  // `autoStart && !launched && initialCwd`, so BOTH leave a cell that counts against the cap and
  // never opens a terminal. The shape is pinned here so the caller's refusal has something to
  // point at: an agent cell with no directory must not be placed (codex [P1], #1890).
  it("still produces an unstartable shape for an agent with no directory — callers must refuse it", () => {
    const made = cellForPick(null, "claude");
    expect(made.autoStart).toBe(true);
    expect(made.cwd).toBeNull(); // autoStart + falsy cwd = the shape GridView's placeFromPanel rejects
  });
});
