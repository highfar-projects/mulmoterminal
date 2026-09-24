// @vitest-environment node
// "Available" has to mean what the spawn preflight means (#2229): the same diagnosis, the same bin,
// every hosted agent answered — an agent missing from the report reads to a picker as one it may
// offer.
import { describe, it, expect, vi } from "vitest";
import { agentAvailability } from "../../../server/agents/agent-availability.js";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../common/sessionAgent.js";
import type { BinaryDiagnosis } from "../../../server/infra/has-binary.js";

const BINS: Record<TerminalAgent, string> = {
  claude: "claude",
  codex: "/opt/codex/bin/codex",
  antigravity: "agy",
  grok: "grok",
  muse: "muse",
  copilot: "copilot",
  cursor: "cursor-agent",
};

const ok = (bin: string): BinaryDiagnosis => ({ kind: "ok", path: `/usr/bin/${bin}` });

describe("agentAvailability", () => {
  it("answers every hosted agent, in TERMINAL_AGENTS order", () => {
    expect(agentAvailability(BINS, ok).map((entry) => entry.agent)).toEqual([...TERMINAL_AGENTS]);
  });

  // The bin reported is the one checked, override included — a codex set by CODEX_BIN is judged by
  // that path, not by `codex`.
  it("checks and reports each agent's own bin", () => {
    const diagnose = vi.fn(ok);
    const report = agentAvailability(BINS, diagnose);
    expect(diagnose.mock.calls.map(([bin]) => bin)).toEqual(TERMINAL_AGENTS.map((agent) => BINS[agent]));
    expect(report.find((entry) => entry.agent === "codex")).toEqual({ agent: "codex", bin: "/opt/codex/bin/codex", available: true });
  });

  it.each<[BinaryDiagnosis, string]>([
    [{ kind: "missing", searched: ["/usr/bin"] }, "missing"],
    [{ kind: "no-such-path", path: "/nope/grok" }, "no-such-path"],
    [{ kind: "not-executable", path: "/usr/bin/grok" }, "not-executable"],
  ])("reports %j as unavailable, with reason %s", (diagnosis, reason) => {
    const report = agentAvailability(BINS, (bin) => (bin === "grok" ? diagnosis : ok(bin)));
    expect(report.find((entry) => entry.agent === "grok")).toEqual({ agent: "grok", bin: "grok", available: false, reason });
    expect(report.filter((entry) => !entry.available)).toHaveLength(1);
  });

  // Nothing about the machine's layout goes over the wire: no resolved path, no PATH listing.
  it("carries no path or PATH listing from the diagnosis", () => {
    const report = agentAvailability(BINS, (bin) => (bin === "agy" ? { kind: "missing", searched: ["/secret/dir"] } : ok(bin)));
    expect(JSON.stringify(report)).not.toContain("/secret/dir");
    expect(JSON.stringify(report)).not.toContain("/usr/bin/");
  });
});
