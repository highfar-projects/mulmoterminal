// The refactor pack's checks decide when a round of work counts as done, so they are run here for real:
// in a scratch folder holding the files a build would write, with a stand-in `gh` on the PATH.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRecord } from "../../../common/isRecord";

const PACKS = join(import.meta.dirname, "..", "..", "..", "blueprints");
const TARGETS = join(PACKS, "refactor", "checks", "targets.mjs");
const GATES = join(PACKS, "repo", "checks", "gates.sh");
const PRS = join(PACKS, "refactor", "checks", "prs.sh");
const AUTO_MERGE = "CI が緑なら自動でマージする";

let dir: string;
let fakeBin: string;

const write = (file: string, content: unknown): void => {
  writeFileSync(join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
};

// Exit code and stderr of one run; a check is judged by its exit code alone.
function run(command: string, args: string[]): { code: number; stderr: string } {
  try {
    execFileSync(command, args, { cwd: dir, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}` }, stdio: "pipe" });
    return { code: 0, stderr: "" };
  } catch (err) {
    if (!isRecord(err)) return { code: 1, stderr: String(err) };
    return { code: typeof err.status === "number" ? err.status : 1, stderr: Buffer.isBuffer(err.stderr) ? err.stderr.toString() : "" };
  }
}

const targets = (mode: string) => run(process.execPath, [TARGETS, mode]);

const target = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "decompose", title: id, files: ["src/a.ts"], status: "todo", ...extra });
const done = (id: string, pr = 1) => target(id, { status: "done", pr: `https://github.com/o/r/pull/${pr}` });

// `gh pr view <url> --json state -q .state` answers from this table, keyed by the PR number.
function fakeGh(states: Record<number, string>): void {
  const cases = Object.entries(states)
    .map(([number, state]) => `  */pull/${number}) echo ${state} ;;`)
    .join("\n");
  const script = join(fakeBin, "gh");
  writeFileSync(script, `#!/bin/sh\ncase "$3" in\n${cases}\n  *) echo "unknown" >&2; exit 1 ;;\nesac\n`);
  chmodSync(script, 0o755);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bp-refactor-"));
  fakeBin = mkdtempSync(join(tmpdir(), "bp-bin-"));
  mkdirSync(join(dir, ".blueprint"));
  write(".blueprint/spec.md", "# 計画\n");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(fakeBin, { recursive: true, force: true });
});

describe("targets.mjs survey", () => {
  it("accepts a fresh plan within the agreed count", () => {
    write(".blueprint/targets.json", { targets: [target("a"), target("b")] });
    write(".blueprint/answers.json", { maxChanges: 2 });
    expect(targets("survey").code).toBe(0);
  });

  it("refuses more targets than agreed", () => {
    write(".blueprint/targets.json", { targets: [target("a"), target("b")] });
    write(".blueprint/answers.json", { maxChanges: 1 });
    expect(targets("survey")).toMatchObject({ code: 1, stderr: expect.stringContaining("agreed limit") });
  });

  it("refuses a plan with a target already finished", () => {
    write(".blueprint/targets.json", { targets: [done("a")] });
    expect(targets("survey").code).toBe(1);
  });

  it("refuses a plan without the spec the person reads", () => {
    rmSync(join(dir, ".blueprint", "spec.md"));
    write(".blueprint/targets.json", { targets: [target("a")] });
    expect(targets("survey")).toMatchObject({ code: 1, stderr: expect.stringContaining("spec.md") });
  });

  it("puts the CI target first when CI has gaps, and only then", () => {
    write(".blueprint/ci.json", { gaps: ["typecheck is not run"], defaultBranchGreen: true });
    write(".blueprint/targets.json", { targets: [target("a"), target("ci", { kind: "ci" })] });
    expect(targets("survey").code).toBe(1);
    write(".blueprint/targets.json", { targets: [target("ci", { kind: "ci" }), target("a")] });
    expect(targets("survey").code).toBe(0);
    write(".blueprint/ci.json", { gaps: [], defaultBranchGreen: true });
    write(".blueprint/targets.json", { targets: [target("a")] });
    expect(targets("survey").code).toBe(0);
  });

  it.each([
    ["no file", null],
    ["not JSON", "{"],
    ["no targets array", { targets: {} }],
    ["a bad id", { targets: [target("Bad Id")] }],
    ["an unknown kind", { targets: [target("a", { kind: "rewrite" })] }],
    ["no files", { targets: [target("a", { files: [] })] }],
    ["an unknown status", { targets: [target("a", { status: "started" })] }],
    ["a repeated id", { targets: [target("a"), target("a")] }],
  ])("refuses a plan with %s", (_label, content) => {
    if (content !== null) write(".blueprint/targets.json", content);
    expect(targets("survey").code).toBe(1);
  });
});

describe("targets.mjs progress", () => {
  it("counts a round that finished a target, and refuses one that finished none", () => {
    write(".blueprint/targets.json", { targets: [done("a"), target("b")] });
    expect(targets("progress").code).toBe(0);
    expect(readFileSync(join(dir, ".blueprint", ".targets-finished"), "utf8")).toBe("1");
    expect(targets("progress")).toMatchObject({ code: 1, stderr: expect.stringContaining("no target was finished") });
  });

  it("counts a declined target as finished only with its reason written", () => {
    write(".blueprint/targets.json", { targets: [target("a", { status: "skipped" })] });
    expect(targets("progress").code).toBe(1);
    write(".blueprint/targets.json", { targets: [target("a", { status: "skipped", note: "cannot prove the ordering" })] });
    expect(targets("progress").code).toBe(0);
  });

  it("refuses a target marked done without its pull request", () => {
    write(".blueprint/targets.json", { targets: [target("a", { status: "done" })] });
    expect(targets("progress")).toMatchObject({ code: 1, stderr: expect.stringContaining("pull request URL") });
  });

  it("lets a plan with nothing in it through", () => {
    write(".blueprint/targets.json", { targets: [] });
    expect(targets("progress").code).toBe(0);
  });
});

describe("targets.mjs more", () => {
  it("says there is more while a target is still to do, and not after", () => {
    write(".blueprint/targets.json", { targets: [done("a"), target("b")] });
    expect(targets("more").code).toBe(0);
    write(".blueprint/targets.json", { targets: [done("a"), done("b", 2)] });
    expect(targets("more").code).toBe(1);
  });
});

describe("prs.sh", () => {
  const prs = () => run("/bin/sh", [PRS]);

  it("requires every finished pull request to be merged when merging is automatic", () => {
    write(".blueprint/answers.json", { merge: AUTO_MERGE });
    write(".blueprint/targets.json", { targets: [done("a", 1), done("b", 2)] });
    fakeGh({ 1: "MERGED", 2: "OPEN" });
    expect(prs()).toMatchObject({ code: 1, stderr: expect.stringContaining("b: https://github.com/o/r/pull/2 is OPEN") });
    fakeGh({ 1: "MERGED", 2: "MERGED" });
    expect(prs().code).toBe(0);
  });

  it("accepts an open pull request when the person merges them", () => {
    write(".blueprint/answers.json", { merge: "PR まで（マージは自分でする）" });
    write(".blueprint/targets.json", { targets: [done("a", 1)] });
    fakeGh({ 1: "OPEN" });
    expect(prs().code).toBe(0);
    fakeGh({ 1: "CLOSED" });
    expect(prs().code).toBe(1);
  });

  it("fails when the pull request cannot be read", () => {
    write(".blueprint/targets.json", { targets: [done("a", 9)] });
    fakeGh({ 1: "MERGED" });
    expect(prs().code).toBe(1);
  });
});

describe("targets.mjs report", () => {
  it("requires the report to name every target", () => {
    write(".blueprint/targets.json", { targets: [done("a"), target("b", { status: "skipped", note: "x" })] });
    write(".blueprint/refactor-report.md", "a を分けた。");
    expect(targets("report")).toMatchObject({ code: 1, stderr: expect.stringContaining("b") });
    write(".blueprint/refactor-report.md", "a を分けた。b は見送った。");
    expect(targets("report").code).toBe(0);
  });
});

describe("gates.sh", () => {
  const gates = () => run("/bin/sh", [GATES]);

  it("passes when the install and every gate exit 0", () => {
    write(".blueprint/gates.json", {
      install: "true",
      gates: [
        { name: "lint", command: "true" },
        { name: "test", command: "true" },
      ],
    });
    expect(gates().code).toBe(0);
  });

  it("fails naming the gate that failed, even when a later one passes", () => {
    write(".blueprint/gates.json", {
      install: "true",
      gates: [
        { name: "lint", command: "echo broken; false" },
        { name: "test", command: "true" },
      ],
    });
    expect(gates()).toMatchObject({ code: 1, stderr: expect.stringContaining("echo broken; false") });
  });

  it("fails when the install fails", () => {
    write(".blueprint/gates.json", { install: "false", gates: [{ name: "test", command: "true" }] });
    expect(gates().code).toBe(1);
  });

  it.each([
    ["no gates", { install: "true", gates: [] }],
    ["no install", { gates: [{ name: "test", command: "true" }] }],
    ["a gate without a command", { install: "true", gates: [{ name: "test" }] }],
  ])("refuses a record with %s", (_label, record) => {
    write(".blueprint/gates.json", record);
    expect(gates().code).toBe(1);
  });
});
