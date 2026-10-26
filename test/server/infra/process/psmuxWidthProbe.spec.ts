// @vitest-environment node
//
// psmux is not run here (it is Windows only); its grid is stood in for by a fake answering
// `#{cursor_x}` from a given rule. What psmux really draws for these samples was read on Windows by
// the reporter of #3180, and `test/common/tmuxClusters.spec.ts` pins the rule to those readings.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { PSMUX_WIDTH_RUNS } from "../../../../common/psmuxWidthRuns";
import { rowWidthOf } from "../../../../common/tmuxClusters";
import type { TmuxWidthTable } from "../../../../common/tmuxWidthTable";
import { PSMUX_SAMPLES, measurePsmuxWith, psmuxPrintCommand, psmuxTableIfMatching } from "../../../../server/infra/process/psmuxWidthProbe";
import type { ThrowawayTmux } from "../../../../server/infra/process/throwawayTmux";

const PSMUX: TmuxWidthTable = { runs: PSMUX_WIDTH_RUNS, folding: "psmux", vs16Wide: true };
const predicted = (table: TmuxWidthTable) => PSMUX_SAMPLES.map((sample) => rowWidthOf(table, sample));

// A psmux whose grid counts with `table`: a session prints its sample, and `#{cursor_x}` is the column
// the sample and its marker end on.
function fakePsmux(table: TmuxWidthTable, log: string[][] = []): ThrowawayTmux {
  const printed = new Map<string, string>();
  return {
    run: async (args) => {
      log.push(args);
      const flag = args.includes("-t") ? "-t" : "-s";
      const session = args[args.indexOf(flag) + 1] ?? "";
      if (args.includes("new-session")) {
        const hex = /from\('([0-9a-f]*)'/.exec(args.at(-1) ?? "")?.[1];
        if (hex !== undefined) printed.set(session, Buffer.from(hex, "hex").toString("utf8"));
        return { ok: true, stdout: "" };
      }
      if (args.includes("capture-pane")) return { ok: true, stdout: `${printed.get(session) ?? ""}\n` };
      if (args.includes("#{cursor_x}")) {
        const text = printed.get(session) ?? "";
        const marker = /\|\d+\|$/.exec(text)?.[0] ?? "";
        return { ok: true, stdout: `${rowWidthOf(table, text.slice(0, text.length - marker.length)) + marker.length}\n` };
      }
      if (args.includes("#{version}")) return { ok: true, stdout: "3.4.0\n" };
      return { ok: true, stdout: "" };
    },
  };
}

describe("psmuxTableIfMatching", () => {
  it("takes the generated table when psmux drew every sample where it predicts", () => {
    expect(psmuxTableIfMatching(predicted(PSMUX))).toEqual(PSMUX);
  });

  it.each([
    ["one sample off by a column", predicted(PSMUX).map((width, index) => (index === 0 ? width + 1 : width))],
    ["a sample it could not read", predicted(PSMUX).map((width, index) => (index === 0 ? null : width))],
    ["too few readings", predicted(PSMUX).slice(1)],
    ["no readings", []],
  ])("refuses %s", (_label, measured) => {
    expect(psmuxTableIfMatching(measured)).toBeNull();
  });

  it("refuses a psmux that pairs a third indicator, as tmux 3.6a does", () => {
    expect(psmuxTableIfMatching(predicted({ ...PSMUX, folding: "tmux-3.6a" }))).toBeNull();
  });

  it("refuses a psmux counting post-Unicode-11 emoji as one column", () => {
    const older: TmuxWidthTable = { ...PSMUX, runs: PSMUX_WIDTH_RUNS.filter(([first]) => first < 0x1f900) };
    expect(psmuxTableIfMatching(predicted(older))).toBeNull();
  });
});

describe("psmuxPrintCommand", () => {
  it("prints the sample's exact bytes through node, whatever they are", () => {
    const sample = `${PSMUX_SAMPLES.join("")}'"\\$\`|0|`;
    const script = /^node -e "(.*)"$/.exec(psmuxPrintCommand(sample))?.[1]?.replace("setInterval(()=>{},1e9)", "") ?? "";
    expect(execFileSync(process.execPath, ["-e", script]).toString("utf8")).toBe(sample);
  });
});

describe("measurePsmuxWith", () => {
  it("measures each sample in a session of its own and keeps the table when they match", async () => {
    const calls: string[][] = [];
    const lines: string[] = [];
    const measurement = await measurePsmuxWith(fakePsmux(PSMUX, calls), (line) => lines.push(line));
    expect(measurement).toEqual({ table: PSMUX, version: "3.4.0" });
    expect(lines).toEqual([]);
    expect(calls.filter((args) => args.includes("new-session"))).toHaveLength(PSMUX_SAMPLES.length + 1);
    expect(calls.filter((args) => args.includes("kill-session"))).toHaveLength(PSMUX_SAMPLES.length);
    expect(calls.some((args) => args.includes("respawn-pane"))).toBe(false);
  });

  it("gives up, and says what psmux drew, when the grid disagrees", async () => {
    const lines: string[] = [];
    await expect(measurePsmuxWith(fakePsmux({ ...PSMUX, folding: "tmux-3.6a" }), (line) => lines.push(line))).resolves.toBeNull();
    expect(lines.join("\n")).toContain("psmux drew the samples as");
  });

  it("gives up when the server will not start", async () => {
    const refusing: ThrowawayTmux = { run: async () => ({ ok: false, stdout: "" }) };
    await expect(measurePsmuxWith(refusing, () => undefined)).resolves.toBeNull();
  });
});
