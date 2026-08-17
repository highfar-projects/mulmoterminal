// @vitest-environment node
//
// Reading claude's transcript for the phone's view (#1751): which window is read, when it widens,
// and which of the four answers each on-disk situation produces.
//
// The transcripts live under a temp HOME, the same arrangement cleared-transcripts.spec.ts uses,
// because both exercise claude's real on-disk layout through projectSessionsDir.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearedTranscripts } from "../../../server/session/cleared-transcripts.js";
import { projectSessionsDir } from "../../../server/session/project-dir.js";
import { sessionTranscriptView, type TranscriptWindow } from "../../../server/session/transcript-view-read.js";

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

// A window that starts `bytesInto` bytes past the START of the last `fromLast` lines — so the read
// deliberately begins mid-line, which is the case the whole widening rule exists for.
const windowFrom = (lines: string[], fromLast: number, bytesInto: number): TranscriptWindow => {
  const tail = lines.slice(lines.length - fromLast).join("");
  return { tailBytes: Buffer.byteLength(tail, "utf8") - bytesInto, maxTailBytes: 64 * 1024 };
};

const SMALL_WINDOW: TranscriptWindow = { tailBytes: 512, maxTailBytes: 64 * 1024 };

const rowTexts = (turn: { rows: { text: string }[] }): string[] => turn.rows.map((row) => row.text);

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-transcript-view-"));
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

describe("sessionTranscriptView", () => {
  it("reads the conversation as turns", async () => {
    await writeTranscript(userLine("first"), assistantLine("here you go"), userLine("second"), assistantLine("done"));
    const view = await sessionTranscriptView(cwd, SESSION);
    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.turns.map(rowTexts)).toEqual([
      ["first", "here you go"],
      ["second", "done"],
    ]);
    // The whole file fitted in one window, so nothing is missing.
    expect(view.truncated).toBe(false);
  });

  it("says truncated when the window did not reach the file's head", async () => {
    const lines = [userLine("first"), assistantLine("body"), userLine("second"), assistantLine("done")];
    await writeTranscript(...lines);
    // Starts ten bytes into the `second` prompt's line, so the fold sees only what follows it.
    const view = await sessionTranscriptView(cwd, SESSION, windowFrom(lines, 1, -10));
    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.turns.map((turn) => turn.rows[0]?.text)).toEqual(["second"]);
    expect(view.truncated).toBe(true);
  });

  describe("the four answers", () => {
    it("none when there is no transcript at all", async () => {
      expect(await sessionTranscriptView(cwd, SESSION)).toEqual({ status: "none" });
    });

    it("none for a zero-byte transcript", async () => {
      await writeTranscript();
      expect(await sessionTranscriptView(cwd, SESSION)).toEqual({ status: "none" });
    });

    it("none when nothing in the file parses", async () => {
      await writeTranscript("not json\n", "{oops\n");
      expect(await sessionTranscriptView(cwd, SESSION)).toEqual({ status: "none" });
    });

    it("none when the WHOLE file was read and simply holds no turn — a size answer would be a lie", async () => {
      await writeTranscript(assistantLine("orphan"), assistantLine("another"));
      expect(await sessionTranscriptView(cwd, SESSION)).toEqual({ status: "none" });
    });

    it("cleared when /clear froze the file — which still exists, holding the conversation just ended", async () => {
      await writeTranscript(userLine("the conversation the user ended"), assistantLine("bye"));
      clearedTranscripts.add(SESSION);
      expect(await sessionTranscriptView(cwd, SESSION)).toEqual({ status: "cleared" });
    });

    it("too-large when the window widened to its ceiling without finding a turn", async () => {
      // One record far bigger than the ceiling, so every window opens inside it.
      await writeTranscript(userLine("the prompt, far away at the head"), assistantLine("x".repeat(8000)), assistantLine("small"));
      expect(await sessionTranscriptView(cwd, SESSION, { tailBytes: 512, maxTailBytes: 1024 })).toEqual({ status: "too-large" });
    });
  });

  describe("widening the window", () => {
    it("widens past a record bigger than the window, so the newest turn is not lost with it", async () => {
      // The whole point of decision 1: the newest turn is shown whatever it costs. A 4.5 MB single
      // record is not hypothetical (#1692) — the range fold drops the partial line it starts inside,
      // taking that record's turn with it unless the window grows.
      await writeTranscript(userLine("the prompt"), assistantLine("y".repeat(4000)));
      const view = await sessionTranscriptView(cwd, SESSION, SMALL_WINDOW);
      expect(view.status).toBe("ok");
      if (view.status !== "ok") return;
      expect(view.turns[0]?.rows[0]?.text).toBe("the prompt");
    });

    it("widens when the window holds RECORDS but no boundary", async () => {
      // `[record bigger than the window][a small assistant record]`: a reader that stopped at "I got
      // a record" would answer here, and its answer would be missing the turn it promised.
      const lines = [userLine("the prompt"), assistantLine("y".repeat(4000)), assistantLine("small")];
      await writeTranscript(...lines);
      const view = await sessionTranscriptView(cwd, SESSION, SMALL_WINDOW);
      expect(view.status).toBe("ok");
      if (view.status !== "ok") return;
      expect(view.turns.map(rowTexts)).toEqual([["the prompt", "y".repeat(4000), "small"]]);
    });

    it("returns the newest turn COMPLETE once a boundary is in the window", async () => {
      // The stopping condition is "a boundary is in the window"; the guarantee is "the newest turn
      // is whole". They agree because nothing follows the LAST boundary except that turn's own
      // records — so a window holding any boundary holds the last one and everything after it.
      const lines = [userLine("old"), assistantLine("old body"), userLine("new"), assistantLine("part one"), assistantLine("part two")];
      await writeTranscript(...lines);
      const view = await sessionTranscriptView(cwd, SESSION, windowFrom(lines, 3, -20));
      expect(view.status).toBe("ok");
      if (view.status !== "ok") return;
      expect(view.turns.map(rowTexts)).toEqual([["new", "part one", "part two"]]);
    });
  });

  describe("what it refuses to read", () => {
    it("answers none for a session the host has no directory for, without reading its own", async () => {
      // projectSessionsDir("") resolves against the SERVER's working directory, so an unknown id
      // would otherwise be answered with whatever transcript of that name sits beside the server.
      const beside = projectSessionsDir(process.cwd());
      await fs.mkdir(beside, { recursive: true }).catch(() => {});
      await fs.writeFile(path.join(beside, `${SESSION}.jsonl`), userLine("not this session's conversation"));
      expect(await sessionTranscriptView("", SESSION)).toEqual({ status: "none" });
    });

    it("answers none for anything that is not a session id", async () => {
      await writeTranscript(userLine("hello"));
      const ids = ["", "../../../../etc/passwd", "not-a-uuid", `${SESSION}/../${SESSION}`, `${SESSION}.jsonl`];
      const answers = await Promise.all(ids.map((id) => sessionTranscriptView(cwd, id)));
      expect(answers).toEqual(ids.map(() => ({ status: "none" })));
    });
  });

  describe("the file handle", () => {
    // Polled every five seconds per open session, so one path that forgets to close is not one
    // leaked descriptor — it is a slow climb to EMFILE and a server that stops accepting anything.
    // Reading through a closed handle rejects with EBADF, which is the only way to ask a
    // FileHandle whether it is still open.
    const isClosed = async (handle: FileHandle): Promise<boolean> =>
      handle.read(Buffer.alloc(1), 0, 1, 0).then(
        () => false,
        () => true,
      );

    const closedHandles = (): Promise<boolean[]> => Promise.all(vi.mocked(fs.open).mock.results.map((result) => result.value.then(isClosed)));

    beforeEach(() => {
      vi.spyOn(fs, "open");
    });

    it("closes it after a normal read", async () => {
      await writeTranscript(userLine("hello"));
      await sessionTranscriptView(cwd, SESSION);
      expect(await closedHandles()).toEqual([true]);
    });

    it("closes it when it gives up with too-large", async () => {
      await writeTranscript(userLine("far away"), assistantLine("x".repeat(8000)));
      expect(await sessionTranscriptView(cwd, SESSION, { tailBytes: 512, maxTailBytes: 1024 })).toEqual({ status: "too-large" });
      expect(await closedHandles()).toEqual([true]);
    });

    it("does not open the file at all for a cleared session", async () => {
      await writeTranscript(userLine("ended"));
      clearedTranscripts.add(SESSION);
      await sessionTranscriptView(cwd, SESSION);
      expect(vi.mocked(fs.open)).not.toHaveBeenCalled();
    });
  });
});
