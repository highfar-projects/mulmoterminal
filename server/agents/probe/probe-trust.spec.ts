// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureProbeFolderTrusted, withProbeFolderTrusted } from "./probe-trust";

const DIR = "/home/me/.mulmoterminal/probe";

// The shape Claude Code writes: two-space indent, a project entry carrying fields of its own.
const CONFIG = JSON.stringify(
  { numStartups: 7, projects: { "/home/me/work": { allowedTools: ["Bash"], hasTrustDialogAccepted: true } }, theme: "dark" },
  null,
  2,
);

const parsed = (text: string): Record<string, unknown> => JSON.parse(text);
const projectsOf = (text: string): Record<string, unknown> => parsed(text).projects as Record<string, unknown>;

describe("withProbeFolderTrusted (#3206)", () => {
  it("adds the folder as a trusted project and changes nothing else", () => {
    const edit = withProbeFolderTrusted(CONFIG, DIR);
    expect(edit.outcome).toBe("write");
    if (edit.outcome !== "write") return;
    expect(projectsOf(edit.text)).toEqual({
      "/home/me/work": { allowedTools: ["Bash"], hasTrustDialogAccepted: true },
      [DIR]: { hasTrustDialogAccepted: true },
    });
    expect(Object.keys(parsed(edit.text))).toEqual(["numStartups", "projects", "theme"]);
    expect(parsed(edit.text).numStartups).toBe(7);
  });

  // Claude Code may already hold other answers for the folder (a user who opened it once); those
  // stay, and only the one field is added.
  it("keeps an existing entry's other fields", () => {
    const edit = withProbeFolderTrusted(JSON.stringify({ projects: { [DIR]: { hasTrustDialogAccepted: false, lastCost: 0.1 } } }), DIR);
    expect(edit.outcome).toBe("write");
    if (edit.outcome !== "write") return;
    expect(projectsOf(edit.text)[DIR]).toEqual({ hasTrustDialogAccepted: true, lastCost: 0.1 });
  });

  it("writes nothing when the folder is already trusted", () => {
    expect(withProbeFolderTrusted(JSON.stringify({ projects: { [DIR]: { hasTrustDialogAccepted: true } } }), DIR)).toEqual({ outcome: "trusted" });
  });

  it("creates the projects map when the config has none", () => {
    const edit = withProbeFolderTrusted("{}", DIR);
    expect(edit.outcome).toBe("write");
    if (edit.outcome !== "write") return;
    expect(projectsOf(edit.text)).toEqual({ [DIR]: { hasTrustDialogAccepted: true } });
  });

  // Half-written by Claude Code, or not its file at all: nothing here may guess at a repair.
  it("refuses anything that is not Claude Code's config", () => {
    expect(withProbeFolderTrusted("{ not json", DIR)).toEqual({ outcome: "unreadable" });
    expect(withProbeFolderTrusted("", DIR)).toEqual({ outcome: "unreadable" });
    expect(withProbeFolderTrusted("[]", DIR)).toEqual({ outcome: "unreadable" });
    expect(withProbeFolderTrusted("null", DIR)).toEqual({ outcome: "unreadable" });
    expect(withProbeFolderTrusted(JSON.stringify({ projects: "yes" }), DIR)).toEqual({ outcome: "unreadable" });
    expect(withProbeFolderTrusted(JSON.stringify({ projects: [] }), DIR)).toEqual({ outcome: "unreadable" });
  });

  it("matches the file's indentation and its trailing newline, either way", () => {
    const without = withProbeFolderTrusted("{}", DIR);
    const withNewline = withProbeFolderTrusted("{}\n", DIR);
    expect(without.outcome === "write" && without.text.endsWith("}")).toBe(true);
    expect(withNewline.outcome === "write" && withNewline.text.endsWith("}\n")).toBe(true);
    expect(without.outcome === "write" && without.text).toContain('\n  "projects": {\n    "');
  });
});

describe("ensureProbeFolderTrusted (#3206)", () => {
  const dirs: string[] = [];
  const home = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "mt-probe-trust-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("rewrites the file in place, keeping its mode, and leaves no temporary file behind", () => {
    const file = path.join(home(), ".claude.json");
    writeFileSync(file, CONFIG, { mode: 0o600 });

    expect(ensureProbeFolderTrusted(file, DIR)).toBe(true);

    expect(projectsOf(readFileSync(file, "utf8"))[DIR]).toEqual({ hasTrustDialogAccepted: true });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(path.dirname(file))).toEqual([".claude.json"]);
  });

  it("reports an already trusted folder without touching the file", () => {
    const file = path.join(home(), ".claude.json");
    const text = JSON.stringify({ projects: { [DIR]: { hasTrustDialogAccepted: true } } });
    writeFileSync(file, text);
    const before = statSync(file).mtimeMs;

    expect(ensureProbeFolderTrusted(file, DIR)).toBe(true);

    expect(readFileSync(file, "utf8")).toBe(text);
    expect(statSync(file).mtimeMs).toBe(before);
  });

  // A login that has never run claude has no config file; making one would be writing another
  // app's config from scratch, which this never does.
  it("creates nothing when the login has no config file yet", () => {
    const file = path.join(home(), ".claude.json");

    expect(ensureProbeFolderTrusted(file, DIR)).toBe(false);

    expect(existsSync(file)).toBe(false);
  });

  it("leaves a file it cannot read as config exactly as it was", () => {
    const file = path.join(home(), ".claude.json");
    writeFileSync(file, '{"projects": {"/x": {"hasTrustDialogAccepted": tr');

    expect(ensureProbeFolderTrusted(file, DIR)).toBe(false);

    expect(readFileSync(file, "utf8")).toBe('{"projects": {"/x": {"hasTrustDialogAccepted": tr');
  });
});
