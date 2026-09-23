// @vitest-environment node
//
// Walking a conversation BACKWARDS, a page at a time (#2112).
//
// The property that matters is not "a page comes back" — it is that the pages STITCH: read them all
// and you have the file, with nothing served twice and nothing skipped in between. A gap here is
// invisible at the far end, because a conversation missing two turns in the middle reads like a
// conversation.
//
// Same temp-HOME arrangement as transcript-view-read.spec.ts, for the same reason: this exercises
// claude's real on-disk layout through projectSessionsDir.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearedTranscripts } from "../../../server/session/cleared-transcripts.js";
import { projectSessionsDir } from "../../../server/session/project-dir.js";
import { parseTranscriptCursor, sessionTranscriptPage, type TranscriptWindow } from "../../../server/session/transcript-view-read.js";
import type { TranscriptTurn } from "../../../common/transcriptView.js";

const SESSION = "11111111-2222-4333-8444-555555555555";

let home = "";
let cwd = "";

const line = (record: unknown): string => `${JSON.stringify(record)}\n`;
const userLine = (text: string) => line({ type: "user", timestamp: "2026-08-18T00:00:00.000Z", message: { role: "user", content: text } });
const assistantLine = (text: string) =>
  line({ type: "assistant", timestamp: "2026-08-18T00:00:01.000Z", message: { role: "assistant", content: [{ type: "text", text }] } });

async function writeTranscript(...lines: string[]): Promise<void> {
  const dir = projectSessionsDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${SESSION}.jsonl`), lines.join(""));
}

/** A window small enough that a many-turn transcript needs several pages. `maxTailBytes` stays
 *  large: widening is transcript-view-read.spec.ts's subject, not this file's. */
const SMALL: TranscriptWindow = { tailBytes: 256, maxTailBytes: 64 * 1024 };

const texts = (turns: readonly TranscriptTurn[]): string[][] => turns.map((turn) => turn.rows.map((row) => row.text));

/** Every page, oldest page first — the walk a reader makes by scrolling up until it stops.
 *
 *  Bounded, so a cursor that failed to advance ends the test with a clear failure rather than
 *  hanging the suite: that IS one of the bugs this file is here to catch. */
async function allPages(window: TranscriptWindow): Promise<TranscriptTurn[]> {
  const pages: TranscriptTurn[][] = [];
  let before: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const page = await sessionTranscriptPage(cwd, SESSION, before, window);
    if (page.view.status === "ok") pages.unshift(page.view.turns);
    if (page.older === null) return pages.flat();
    expect(page.older).not.toBe(before); // a cursor that repeats itself is an infinite scroll
    before = page.older;
  }
  throw new Error("the walk did not reach the head of the transcript");
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-transcript-page-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
  cwd = path.join(home, "ws");
  await fs.mkdir(cwd, { recursive: true });
  clearedTranscripts.clear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(home, { recursive: true, force: true });
  clearedTranscripts.clear();
});

describe("sessionTranscriptPage", () => {
  it("answers the newest turns first, with a cursor for what is older", async () => {
    const turns = [1, 2, 3, 4, 5, 6].flatMap((n) => [userLine(`ask ${n}`), assistantLine(`answer ${n}`)]);
    await writeTranscript(...turns);
    const page = await sessionTranscriptPage(cwd, SESSION, null, SMALL);
    expect(page.view.status).toBe("ok");
    if (page.view.status !== "ok") return;
    // The NEWEST end: whatever the window held, it ends on the last turn written.
    expect(texts(page.view.turns).at(-1)).toEqual(["ask 6", "answer 6"]);
    expect(page.older).not.toBeNull();
  });

  it("stitches: every page together is the whole conversation, in order, once each", async () => {
    const wanted = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`ask ${n}`, `answer ${n}`]);
    await writeTranscript(...wanted.flatMap(([ask, answer]) => [userLine(ask ?? ""), assistantLine(answer ?? "")]));
    expect(texts(await allPages(SMALL))).toEqual(wanted);
  });

  it("stitches the same way when one page holds the lot", async () => {
    const wanted = [1, 2].map((n) => [`ask ${n}`, `answer ${n}`]);
    await writeTranscript(...wanted.flatMap(([ask, answer]) => [userLine(ask ?? ""), assistantLine(answer ?? "")]));
    expect(texts(await allPages({ tailBytes: 64 * 1024, maxTailBytes: 64 * 1024 }))).toEqual(wanted);
  });

  // THE BUG THIS PREVENTS: the window's own start byte is the obvious cursor and is wrong. The
  // budget evicts from the front, so the turns between the window start and the oldest one KEPT have
  // been dropped — and a cursor at the window start pages straight past them.
  it("points the cursor at the oldest turn KEPT, not at where the window opened", async () => {
    // Turns tall enough that ONE window holds several and the LINE budget throws the older ones
    // away — which is the only way to tell the two candidate cursors apart. The whole file fits in
    // the window on purpose: if the cursor were the window start, it would be 0 and the walk would
    // end here, losing every evicted turn with nothing saying so.
    const tall = (text: string): string => [text, ...Array.from({ length: 80 }, (_, i) => `line ${i}`)].join("\n");
    const wanted = [1, 2, 3, 4, 5, 6].map((n) => [`ask ${n}`, tall(`answer ${n}`)]);
    await writeTranscript(...wanted.flatMap(([ask, answer]) => [userLine(ask ?? ""), assistantLine(answer ?? "")]));
    const whole: TranscriptWindow = { tailBytes: 1024 * 1024, maxTailBytes: 1024 * 1024 };
    const first = await sessionTranscriptPage(cwd, SESSION, null, whole);
    if (first.view.status !== "ok") return expect.unreachable("expected a page");
    // The budget did evict — otherwise this test proves nothing about the cursor.
    expect(first.view.turns.length).toBeLessThan(wanted.length);
    expect(first.older).not.toBeNull();
    expect(texts(await allPages(whole))).toEqual(wanted);
  });

  // THE SECOND TRIM, and the one the scan cannot see. `transcriptViewOf` drops further turns from the
  // front to fit TRANSCRIPT_MAX_BYTES, after the line budget has had its say — so a cursor taken from
  // the SCAN pages straight past everything the byte cap dropped. Found by walking real transcripts:
  // 8 of one file's 31 turns were unreachable, and the walk still ended tidily at the head, which is
  // exactly why nothing said so.
  it("follows the byte cap's trim as well as the line budget's", async () => {
    // Two logical lines per turn, so the LINE budget never fires — and wide enough that the byte cap
    // does. This isolates the second trim from the first.
    const wide = (text: string): string => `${text} ${"x".repeat(120 * 1024)}`;
    const wanted = [1, 2, 3, 4].map((n) => [`ask ${n}`, wide(`answer ${n}`)]);
    await writeTranscript(...wanted.flatMap(([ask, answer]) => [userLine(ask ?? ""), assistantLine(answer ?? "")]));
    const whole: TranscriptWindow = { tailBytes: 8 * 1024 * 1024, maxTailBytes: 8 * 1024 * 1024 };
    const first = await sessionTranscriptPage(cwd, SESSION, null, whole);
    if (first.view.status !== "ok") return expect.unreachable("expected a page");
    expect(first.view.turns.length).toBeLessThan(wanted.length); // the cap trimmed, or this proves nothing
    expect(first.older).not.toBeNull();
    expect(texts(await allPages(whole))).toEqual(wanted);
  });

  it("says there is nothing older once the head is reached", async () => {
    await writeTranscript(userLine("only"), assistantLine("turn"));
    const page = await sessionTranscriptPage(cwd, SESSION, null, SMALL);
    expect(page.older).toBeNull();
  });

  // An empty page rather than `none`: past a cursor the client is holding turns this host just
  // served it, and "this session has nothing" over a pane full of conversation is a lie.
  it("answers an empty page, not 'none', when a cursor lands on the head", async () => {
    await writeTranscript(userLine("only"), assistantLine("turn"));
    const page = await sessionTranscriptPage(cwd, SESSION, "claude:1", SMALL);
    expect(page).toEqual({ view: { status: "ok", turns: [], truncated: false }, older: null });
  });

  it("clamps a cursor past the end of the file to what is there now", async () => {
    await writeTranscript(userLine("ask"), assistantLine("answer"));
    const page = await sessionTranscriptPage(cwd, SESSION, "claude:99999999", SMALL);
    expect(page.view.status).toBe("ok");
    if (page.view.status !== "ok") return;
    expect(texts(page.view.turns)).toEqual([["ask", "answer"]]);
  });

  // THIS SPEC USED TO PIN THE HAZARD IT WAS WRITTEN AGAINST (Codex, round 2). A cursor another
  // source minted was "ignored", which meant the source being probed read its NEWEST page — so a
  // walk whose answering source changed between pages appended the newest turns of a different
  // agent's log, and a client asking for "older" got the page it already had. Only the source a
  // cursor NAMES may answer it; anything else ends the walk.
  it("lets only the source a cursor names answer it", async () => {
    await writeTranscript(userLine("ask"), assistantLine("answer"));
    const page = await sessionTranscriptPage(cwd, SESSION, "copilot:3", SMALL);
    expect(page).toEqual({ view: { status: "ok", turns: [], truncated: false }, older: null });
  });

  // Same rule for a cursor that is not one at all. The route refuses these with a 400, and the
  // reader is not entitled to assume the route ran.
  it("ends the walk on a cursor this host did not mint", async () => {
    await writeTranscript(userLine("ask"), assistantLine("answer"));
    expect(await sessionTranscriptPage(cwd, SESSION, "not-a-cursor", SMALL)).toEqual({
      view: { status: "ok", turns: [], truncated: false },
      older: null,
    });
  });

  it("keeps /clear winning over a cursor", async () => {
    await writeTranscript(userLine("ask"), assistantLine("answer"));
    clearedTranscripts.add(SESSION);
    expect(await sessionTranscriptPage(cwd, SESSION, "claude:1", SMALL)).toEqual({ view: { status: "cleared" }, older: null });
  });
});

describe("parseTranscriptCursor", () => {
  it.each([
    ["claude:0", { source: "claude", key: 0 }],
    ["claude:4096", { source: "claude", key: 4096 }],
    ["copilot:12", { source: "copilot", key: 12 }],
  ])("reads %s", (raw, expected) => {
    expect(parseTranscriptCursor(raw)).toEqual(expected);
  });

  // `nosuchagent:1` is the case the widened pattern let through: well-formed, names nothing, and
  // would be answered with the newest page by every source in turn.
  it.each([
    ["claude:"],
    ["claude:-1"],
    ["claude:1.5"],
    [""],
    ["1"],
    ["claude:1e3"],
    ["claude:99999999999999999999"],
    ["claude:1 "],
    ["Claude:1"],
    ["nosuchagent:1"],
    ["shell:1"],
  ])("rejects %j", (raw) => {
    expect(parseTranscriptCursor(raw)).toBeNull();
  });
});
