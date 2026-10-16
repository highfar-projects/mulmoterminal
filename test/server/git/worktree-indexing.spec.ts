// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { excludeFromIndexing, NEVER_INDEX_MARKER, type IndexingExclusionDeps } from "../../../server/git/worktree-indexing.js";

const ROOT = "/home/me/.mulmoterminal/worktrees";
const MARKER = path.join(ROOT, NEVER_INDEX_MARKER);

function fakeDeps(over: Partial<IndexingExclusionDeps> = {}) {
  const calls: string[] = [];
  const deps: IndexingExclusionDeps = {
    platform: "darwin",
    ensureDir: async (dir) => void calls.push(`mkdir ${dir}`),
    exists: () => false,
    writeEmptyFile: async (file) => void calls.push(`write ${file}`),
    tmutil: async (args) => (calls.push(`tmutil ${args.join(" ")}`), 0),
    warn: (message) => void calls.push(`warn ${message}`),
    ...over,
  };
  return { deps, calls };
}

describe("excludeFromIndexing (#3059)", () => {
  it("marks the root for Spotlight and excludes it from Time Machine on macOS", async () => {
    const { deps, calls } = fakeDeps();
    expect(await excludeFromIndexing(ROOT, deps)).toBe("excluded");
    expect(calls).toEqual([`mkdir ${ROOT}`, `write ${MARKER}`, `tmutil addexclusion ${ROOT}`]);
  });

  it.each(["linux", "win32", "freebsd"] as const)("does nothing on %s", async (platform) => {
    const { deps, calls } = fakeDeps({ platform });
    expect(await excludeFromIndexing(ROOT, deps)).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("leaves an existing marker alone and still asks Time Machine", async () => {
    const { deps, calls } = fakeDeps({ exists: (file) => file === MARKER });
    expect(await excludeFromIndexing(ROOT, deps)).toBe("excluded");
    expect(calls).toEqual([`mkdir ${ROOT}`, `tmutil addexclusion ${ROOT}`]);
  });

  // `-p` (a path exclusion) needs root and would outlive the directory; the sticky form needs neither.
  it("never asks for a path exclusion", async () => {
    const { deps, calls } = fakeDeps();
    await excludeFromIndexing(ROOT, deps);
    expect(calls.filter((call) => call.startsWith("tmutil")).every((call) => !call.includes(" -p"))).toBe(true);
  });

  it("says so, and does not throw, when tmutil refuses", async () => {
    const { deps, calls } = fakeDeps({ tmutil: async () => 1 });
    expect(await excludeFromIndexing(ROOT, deps)).toBe("failed");
    expect(calls.at(-1)).toMatch(/^warn .*addexclusion.*exited 1/);
  });

  it("says so, and does not throw, when the directory or the marker cannot be written", async () => {
    const { deps, calls } = fakeDeps({
      writeEmptyFile: async () => {
        throw new Error("EACCES");
      },
    });
    expect(await excludeFromIndexing(ROOT, deps)).toBe("failed");
    expect(calls.at(-1)).toMatch(/^warn .*EACCES/);
    expect(calls.some((call) => call.startsWith("tmutil"))).toBe(false);
  });
});
