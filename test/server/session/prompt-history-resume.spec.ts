// @vitest-environment node
//
// The resumed read must answer exactly what a full scan would (#1750).
//
// This is a behaviour-preservation claim, so it is proved by running both over generated inputs and
// comparing whole results, not by reading the resume logic — the repo's rule for any change that
// says "same output". The old reader (a full `forEachJsonlRecord` fold) is reproduced here rather
// than imported, because the point is to compare against what the code USED to do.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { forgetHistoryMemo, sessionPrompts } from "../../../server/session/session-reads.js";
import { claudePromptScan, foldClaudePrompt, promptWindow, PROMPT_SCAN_LIMIT } from "../../../server/session/prompt-history.js";
import { forEachJsonlRecord } from "../../../server/infra/jsonl-file.js";
import type { PromptEntry } from "../../../common/promptHistory.js";

const SESSION = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

let home = "";
let realHome: string | undefined;
const historyFile = () => path.join(home, ".claude", "history.jsonl");

const line = (sessionId: string, display: string, timestamp = 1_700_000_000_000) =>
  `${JSON.stringify({ display, pastedContents: {}, timestamp, project: "/ws", sessionId })}\n`;

/** What the reader did before the memo: one fold over the whole file, every time.
 *
 *  Served through `promptWindow`, as the route does — the raw scan holds PROMPT_SCAN_LIMIT (one
 *  over, so overflow is a fact rather than an inference) while what reaches the pane is
 *  PROMPT_HISTORY_MAX. Comparing the raw window against the served one is the wrong comparison and
 *  differs by exactly one row, which looks like a resume bug. */
async function fullScan(sessionId: string): Promise<PromptEntry[]> {
  const scan = claudePromptScan([sessionId], PROMPT_SCAN_LIMIT, undefined);
  await forEachJsonlRecord(historyFile(), (record) => foldClaudePrompt(scan, record));
  return promptWindow(scan.found).prompts;
}

const resumedScan = async (sessionId: string): Promise<PromptEntry[]> => (await sessionPrompts("/ws", sessionId, "claude")).prompts;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-prompt-resume-"));
  realHome = process.env.HOME;
  process.env.HOME = home;
  vi.spyOn(os, "homedir").mockReturnValue(home);
  await fs.mkdir(path.join(home, ".claude"), { recursive: true });
  // The memo map is module state that outlives one test. CI caught this the hard way: on Linux two
  // temp files created in succession got the SAME inode, so a memo from the previous case was
  // accepted for the next one's file. The production guard now also compares birth time, but a test
  // must not lean on that — it starts from no memo at all.
  [SESSION, OTHER].forEach(forgetHistoryMemo);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  await fs.rm(home, { recursive: true, force: true });
});

describe("a resumed prompt-history read equals a full scan", () => {
  it("agrees after every append in a long interleaved run", async () => {
    await fs.writeFile(historyFile(), line(SESSION, "first"));
    expect(await resumedScan(SESSION)).toEqual(await fullScan(SESSION));

    // Interleave other sessions and ours, re-reading after each append: the memo is carried across
    // these calls, so a divergence shows up as soon as it exists rather than at the end.
    for (let i = 0; i < 40; i++) {
      await fs.appendFile(historyFile(), line(i % 3 === 0 ? SESSION : OTHER, `p${i}`, 1_700_000_000_000 + i));
      const [resumed, full] = [await resumedScan(SESSION), await fullScan(SESSION)];
      expect(resumed).toEqual(full);
    }
  });

  it("agrees once the window has overflowed, so the sliding window resumes correctly too", async () => {
    // More than PROMPT_SCAN_LIMIT, written in two halves with a read in between: the second read
    // must drop from the FRONT of a window it did not build.
    const half = Array.from({ length: 80 }, (_, i) => line(SESSION, `a${i}`, 1_700_000_000_000 + i)).join("");
    await fs.writeFile(historyFile(), half);
    await resumedScan(SESSION); // memo taken here, mid-window

    const rest = Array.from({ length: 80 }, (_, i) => line(SESSION, `b${i}`, 1_700_000_100_000 + i)).join("");
    await fs.appendFile(historyFile(), rest);

    const resumed = await resumedScan(SESSION);
    expect(resumed).toEqual(await fullScan(SESSION));
    expect(resumed.at(-1)?.text).toBe("b79");
    expect(resumed).toHaveLength(100); // PROMPT_HISTORY_MAX, the served window
  });

  it("agrees when the file is replaced by a shorter one", async () => {
    await fs.writeFile(historyFile(), Array.from({ length: 10 }, (_, i) => line(SESSION, `old${i}`)).join(""));
    await resumedScan(SESSION); // memo now points past the end of the file that replaces it

    await fs.writeFile(historyFile(), line(SESSION, "rotated"));
    const resumed = await resumedScan(SESSION);
    expect(resumed).toEqual(await fullScan(SESSION));
    expect(resumed.map((p) => p.text)).toEqual(["rotated"]);
  });

  it("does not serve one session's memo to another", async () => {
    await fs.writeFile(historyFile(), line(SESSION, "ours") + line(OTHER, "theirs"));
    expect((await resumedScan(SESSION)).map((p) => p.text)).toEqual(["ours"]);
    expect((await resumedScan(OTHER)).map((p) => p.text)).toEqual(["theirs"]);

    await fs.appendFile(historyFile(), line(SESSION, "ours again"));
    expect((await resumedScan(OTHER)).map((p) => p.text)).toEqual(["theirs"]);
    expect((await resumedScan(SESSION)).map((p) => p.text)).toEqual(["ours", "ours again"]);
  });

  it("reads a file that appears only after the first look", async () => {
    // No history file at all: the reader falls back and must not memoise a failure.
    expect(await resumedScan(SESSION)).toEqual([]);
    await fs.writeFile(historyFile(), line(SESSION, "written later"));
    expect((await resumedScan(SESSION)).map((p) => p.text)).toEqual(["written later"]);
  });
});

// Codex, #1750: the memo is shared, so two overlapping reads used to fold into ONE array — every
// appended prompt counted twice and the sliding window evicted good rows. The reader copies the
// carried scan instead.
describe("overlapping reads of one session", () => {
  it("agree with a full scan, and with each other", async () => {
    await fs.writeFile(historyFile(), Array.from({ length: 5 }, (_, i) => line(SESSION, `p${i}`, 1_700_000_000_000 + i)).join(""));
    await resumedScan(SESSION); // take the memo

    await fs.appendFile(historyFile(), line(SESSION, "appended", 1_700_000_000_100));
    // Started together, so both resume from the same memo before either finishes.
    const [a, b] = await Promise.all([resumedScan(SESSION), resumedScan(SESSION)]);
    const full = await fullScan(SESSION);
    expect(a).toEqual(full);
    expect(b).toEqual(full);
    expect(a.filter((p) => p.text === "appended")).toHaveLength(1); // not folded twice
  });

  it("survives a burst of them without duplicating anything", async () => {
    await fs.writeFile(historyFile(), line(SESSION, "base"));
    await resumedScan(SESSION);
    await fs.appendFile(historyFile(), line(SESSION, "more"));

    const results = await Promise.all(Array.from({ length: 8 }, () => resumedScan(SESSION)));
    const full = await fullScan(SESSION);
    results.forEach((r) => expect(r).toEqual(full));
    expect(full.map((p) => p.text)).toEqual(["base", "more"]);
  });
});

// Codex, #1750: the memo used to record the size stat'd BEFORE the scan. Claude can append while a
// scan runs, so the stream can pass that size; a truncation to a length between the two then looked
// like growth. The guard is the offset the scan actually reached.
describe("a file truncated in place after growing mid-scan", () => {
  it("starts over rather than resuming past the end", async () => {
    await fs.writeFile(historyFile(), Array.from({ length: 20 }, (_, i) => line(SESSION, `long${i}`)).join(""));
    await resumedScan(SESSION);

    // Truncate to a prefix: shorter than where the scan stopped, longer than nothing.
    const kept = Array.from({ length: 3 }, (_, i) => line(SESSION, `long${i}`)).join("");
    await fs.writeFile(historyFile(), kept);

    const resumed = await resumedScan(SESSION);
    expect(resumed).toEqual(await fullScan(SESSION));
    expect(resumed.map((p) => p.text)).toEqual(["long0", "long1", "long2"]);
  });
});
