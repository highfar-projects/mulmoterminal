// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newestRolloutFile, readRolloutTail } from "./codex-rollout";

// A rollout is re-read on EVERY poll of the gauge, from a request handler, and the only thing
// wanted is the last `rate_limits` in it. Reading more than the tail is pure cost, repeated
// forever — which is what happened when the size stopped being passed and a Claude-sized default
// took over (#998).

describe("readRolloutTail", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-rollout-"));
    file = path.join(dir, "rollout.jsonl");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the end of a long rollout, not the whole of it", () => {
    const filler = `{"payload":{"junk":"${"x".repeat(4000)}"}}`;
    const lines = [...Array.from({ length: 2000 }, () => filler), '{"payload":{"marker":"last"}}'];
    writeFileSync(file, lines.join("\n"));
    expect(statSync(file).size).toBeGreaterThan(4 * 1024 * 1024); // bigger than the shared default

    const tail = readRolloutTail(file);

    expect(tail[tail.length - 1]).toContain("last");
    // Far fewer than the 2001 written: proof it stopped at a bound rather than taking the file.
    expect(tail.length).toBeLessThan(200);
  });

  it("returns everything when the file is smaller than the bound", () => {
    writeFileSync(file, ['{"a":1}', '{"b":2}'].join("\n"));
    expect(readRolloutTail(file)).toEqual(['{"a":1}', '{"b":2}']);
  });

  // Every caller wants "no recent reading" rather than an exception — the gauge already renders
  // an absent agent as absent.
  it("says nothing for a file that is not there", () => {
    expect(readRolloutTail(path.join(dir, "never-written.jsonl"))).toEqual([]);
  });
});

// The default home and every codex account are read on the same poll, so each root keeps its own
// cached answer: a single slot was evicted by the next root, and every root was re-walked every poll.
describe("newestRolloutFile", () => {
  const roots: string[] = [];
  const rootWith = (name: string, mtime_sec: number): string => {
    const root = mkdtempSync(path.join(tmpdir(), "mt-rollout-root-"));
    roots.push(root);
    const file = path.join(root, name);
    writeFileSync(file, "{}");
    utimesSync(file, mtime_sec, mtime_sec);
    return root;
  };

  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it("keeps each root's answer while another root is read in between", () => {
    const now_ms = Date.now();
    const old_sec = Math.floor(now_ms / 1000) - 60;
    const first = rootWith("a.jsonl", old_sec);
    const second = rootWith("b.jsonl", old_sec);
    expect(newestRolloutFile(first, now_ms)).toBe(path.join(first, "a.jsonl"));
    expect(newestRolloutFile(second, now_ms)).toBe(path.join(second, "b.jsonl"));
    writeFileSync(path.join(first, "newer.jsonl"), "{}");
    // Still inside the cache window: the answer is the cached one, so no walk happened.
    expect(newestRolloutFile(first, now_ms + 1)).toBe(path.join(first, "a.jsonl"));
  });
});
