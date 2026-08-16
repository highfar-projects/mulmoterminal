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
  // accepted for the next one's file. The production guard reads content rather than `stat` now, but
  // a test must not lean on that — it starts from no memo at all.
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

  // Truncated in place: same file, fewer bytes than the last scan consumed. The LENGTH guard.
  it("agrees when the file is truncated to something shorter", async () => {
    await fs.writeFile(historyFile(), Array.from({ length: 10 }, (_, i) => line(SESSION, `old${i}`)).join(""));
    await resumedScan(SESSION); // memo now points past the end of what replaces it

    await fs.writeFile(historyFile(), line(SESSION, "rotated"));
    const resumed = await resumedScan(SESSION);
    expect(resumed).toEqual(await fullScan(SESSION));
    expect(resumed.map((p) => p.text)).toEqual(["rotated"]);
  });

  // A genuinely NEW file, LARGER than the old offset (CodeRabbit): a replacement that grew past the
  // resume point is the one a length check cannot see. On Linux it is also handed the SAME inode,
  // which is how CI found the `stat`-based guard was too weak in the first place.
  it("agrees when the file is REPLACED by a larger one", async () => {
    await fs.writeFile(historyFile(), Array.from({ length: 5 }, (_, i) => line(SESSION, `old${i}`)).join(""));
    await resumedScan(SESSION);

    await fs.rm(historyFile());
    await fs.writeFile(historyFile(), Array.from({ length: 40 }, (_, i) => line(SESSION, `new${i}`)).join(""));

    const resumed = await resumedScan(SESSION);
    expect(resumed).toEqual(await fullScan(SESSION));
    expect(resumed.map((p) => p.text).every((t) => t.startsWith("new"))).toBe(true);
    expect(resumed).toHaveLength(40);
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

// Codex, #1750: `stat` inspects a PATH and the stream opens that path afterwards. A file replaced
// in between is planned for as the old one and read as the new one, splicing the retained window of
// A onto the tail of B — wrong for exactly one response, which is the kind of wrong that gets
// blamed on the user misreading the screen.
//
// Driven through `open` rather than by timing: the swap happens INSIDE the first open call, which
// is the window between the plan's anchor read and the fold opening the path, and does so
// deterministically.
//
// Both halves below matter, and only the second one is beyond what a `stat` stamp can see. A file
// REPLACED gets a new inode; a file REWRITTEN IN PLACE keeps it, and keeps its birth time too.
// Swap the file open BY open, so a test can choose where in the read the race lands. The fold uses
// `createReadStream` and is not one of these, so what the counted opens step through is the fold's
// surroundings: the head taken first, the anchor read after the fold, and the head re-read last.
const raceOn = (swap: () => Promise<void>, opts: { before?: number } = {}) => {
  const realOpen = fs.open.bind(fs);
  let opens = 0;
  let swapped = false;
  const at = opts.before;
  return vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    // BEFORE the open, the read that follows sees the replacement; AFTER it, that read still holds
    // the file it opened and only a LATER open can notice. Both are real orderings.
    const due = at === undefined ? opens === 0 : opens === at;
    opens += 1;
    if (!swapped && due && at !== undefined) {
      swapped = true;
      await swap();
    }
    const handle = await realOpen(...args);
    if (!swapped && due) {
      swapped = true;
      await swap();
    }
    return handle;
  });
};

describe("the file changed between the anchor check and the read", () => {
  const OLD = Array.from({ length: 5 }, (_, i) => line(SESSION, `old${i}`)).join("");
  // Bigger than the memo's offset, so a length check cannot be what saves either case.
  const NEW = Array.from({ length: 40 }, (_, i) => line(SESSION, `new${i}`)).join("");

  it("does not splice the old window onto the new file", async () => {
    await fs.writeFile(historyFile(), OLD);
    await resumedScan(SESSION); // memo taken against the original file

    const spy = raceOn(async () => {
      await fs.rm(historyFile());
      await fs.writeFile(historyFile(), NEW);
    });
    const resumed = await resumedScan(SESSION);
    spy.mockRestore();

    expect(resumed.map((p) => p.text).every((t) => t.startsWith("new"))).toBe(true);
    expect(resumed).toEqual(await fullScan(SESSION));
  });

  // The same race WITHOUT unlinking: `writeFile` over an existing path truncates in place, so the
  // inode and the birth time both survive it and no stamp made from them can tell the two contents
  // apart. If the rewrite regrows past the memo's offset a length check passes too — and the memo
  // that gets stored then carries the OLD window plus the new file's suffix, which every later read
  // resumes from. This is the case that retired the `stat`-based identity (Codex, #1750).
  it("does not splice the old window onto a file rewritten in place", async () => {
    await fs.writeFile(historyFile(), OLD);
    await resumedScan(SESSION);

    const spy = raceOn(() => fs.writeFile(historyFile(), NEW)); // same inode, same birth time
    const resumed = await resumedScan(SESSION);
    spy.mockRestore();

    expect(resumed.map((p) => p.text).every((t) => t.startsWith("new"))).toBe(true);
    // And the corruption must not outlive the raced call: the NEXT read has to agree too.
    expect(await resumedScan(SESSION)).toEqual(await fullScan(SESSION));
  });

  // A scan that starts from ZERO carries no memo, so there is nothing it was planned against to
  // re-check afterwards — and the anchor stored beside its window is read from the path AFTER the
  // fold, by a separate open. Swap the file in that gap and the memo pairs the OLD file's window
  // with the NEW file's anchor, which every later read then resumes from: a poisoned cache rather
  // than one wrong response (Codex, #1750).
  //
  // Every gap between the reads that surround the fold, including the one that matters most: after
  // the fold and BEFORE the anchor. A swap before the fold is harmless by comparison — the fold then
  // reads the new file from the start and agrees with itself.
  [0, 1, 2].forEach((before) => {
    it(`does not memoise a fresh scan against a file swapped in before read ${before}`, async () => {
      await fs.writeFile(historyFile(), Array.from({ length: 5 }, (_, i) => line(SESSION, `first${i}`)).join(""));

      const spy = raceOn(
        async () => {
          await fs.rm(historyFile());
          await fs.writeFile(historyFile(), NEW);
        },
        { before },
      );
      await resumedScan(SESSION); // no memo yet, so this one scans from zero
      spy.mockRestore();

      // Whatever that raced call answered, what must not survive is a memo built from the first
      // file. These reads are unraced, so they can only disagree with a full scan if one was stored.
      expect(await resumedScan(SESSION)).toEqual(await fullScan(SESSION));
      expect((await resumedScan(SESSION)).map((p) => p.text).every((t) => t.startsWith("new"))).toBe(true);
    });
  });
});
