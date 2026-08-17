// @vitest-environment node
//
// The rules the phone's transcript view is made of (#1751) — which records start a turn, what one
// content block renders as, and what gets dropped when the window is full.
//
// The fixtures below are claude's real on-disk shapes as measured on claude 2.1.226 / 2.1.228 /
// 2.1.231 / 2.1.233 (the `version` field of the twelve transcripts sampled). That format is not a
// published contract, so these are pinned the way project-dir.ts's are: what upstream writes today,
// with the fallbacks that keep a change VISIBLE rather than silent.
import { describe, it, expect } from "vitest";
import { toJsonObject } from "@mulmoclaude/core/remote-host";
import { undefinedPaths } from "@mulmoclaude/core/remote-host/server";
import {
  TOOL_RESULT_MAX_LINES,
  TRANSCRIPT_LINE_BUDGET,
  TRANSCRIPT_MAX_BYTES,
  clipToBytes,
  emptyTranscriptScan,
  foldTranscriptView,
  isTurnBoundary,
  renderRecord,
  transcriptViewOf,
  type TranscriptScan,
  type TranscriptView,
} from "../../../server/session/transcript-view.js";

// Claude's ordinary user record: content is a PLAIN STRING, not an array of blocks.
const userRecord = (text: string, over: Record<string, unknown> = {}) => ({
  type: "user",
  timestamp: "2026-08-18T00:00:00.000Z",
  message: { role: "user", content: text },
  ...over,
});

const assistantRecord = (content: unknown[], over: Record<string, unknown> = {}) => ({
  type: "assistant",
  timestamp: "2026-08-18T00:00:01.000Z",
  message: { role: "assistant", content },
  ...over,
});

// A tool result comes back on a `user` record — the channel the API answers a tool call in.
const toolResultRecord = (content: unknown, over: Record<string, unknown> = {}) => ({
  type: "user",
  timestamp: "2026-08-18T00:00:02.000Z",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_01", content }] },
  ...over,
});

const scanOf = (records: Record<string, unknown>[]): TranscriptScan => {
  const scan = emptyTranscriptScan();
  records.forEach((record) => foldTranscriptView(scan, record));
  return scan;
};

const viewOf = (records: Record<string, unknown>[], midFile = false): TranscriptView => transcriptViewOf(scanOf(records), midFile);

// Narrowing helper: every assertion below is about the `ok` shape, and TypeScript needs to be told.
function okView(view: TranscriptView) {
  expect(view.status).toBe("ok");
  if (view.status !== "ok") throw new Error("expected an ok view");
  return view;
}

describe("isTurnBoundary", () => {
  it("accepts a plain-string user prompt — which is what claude actually writes", () => {
    expect(isTurnBoundary(userRecord("fix the build"))).toBe(true);
  });

  it("accepts the array form too", () => {
    expect(isTurnBoundary({ type: "user", message: { content: [{ type: "text", text: "fix the build" }] } })).toBe(true);
  });

  it("does not need a promptId — 114 real records carry none", () => {
    const record = userRecord("fix the build");
    expect("promptId" in record).toBe(false);
    expect(isTurnBoundary(record)).toBe(true);
  });

  it("rejects a tool result, an injected prompt, an assistant record and a sidechain", () => {
    expect(isTurnBoundary(toolResultRecord("done"))).toBe(false);
    expect(isTurnBoundary(userRecord("<local-command-stdout>ok</local-command-stdout>"))).toBe(false);
    expect(isTurnBoundary(assistantRecord([{ type: "text", text: "hello" }]))).toBe(false);
    expect(isTurnBoundary(userRecord("fix the build", { isSidechain: true }))).toBe(false);
  });
});

describe("renderRecord", () => {
  it("renders one row per block, in the content's own order", () => {
    const rows = renderRecord(
      assistantRecord([
        { type: "text", text: "I'll read it first" },
        { type: "tool_use", id: "toolu_01", name: "Read", input: { file_path: "/a/b.ts" } },
        { type: "text", text: "then edit" },
      ]),
    );
    expect(rows).toEqual([
      { kind: "assistant", text: "I'll read it first" },
      { kind: "tool", text: "Read" },
      { kind: "assistant", text: "then edit" },
    ]);
  });

  it("shows a tool_use as its NAME only — the arguments are what make a call long", () => {
    const rows = renderRecord(assistantRecord([{ type: "tool_use", id: "t", name: "Bash", input: { command: "x".repeat(5000) } }]));
    expect(rows).toEqual([{ kind: "tool", text: "Bash" }]);
  });

  it("treats a plain-string content as one text block", () => {
    expect(renderRecord(userRecord("hello"))).toEqual([{ kind: "user", text: "hello" }]);
  });

  it("drops a thinking block, because its text measured 0 characters on disk", () => {
    const rows = renderRecord(
      assistantRecord([
        { type: "thinking", thinking: "", signature: "x".repeat(2284) },
        { type: "text", text: "done" },
      ]),
    );
    expect(rows).toEqual([{ kind: "assistant", text: "done" }]);
  });

  it("renders a thinking block that DOES carry text — the rule is 'nothing to show', not 'do not show'", () => {
    const rows = renderRecord(assistantRecord([{ type: "thinking", thinking: "weighing two options", signature: "sig" }]));
    expect(rows).toEqual([{ kind: "assistant", text: "weighing two options" }]);
  });

  it("renders an unknown block type rather than ignoring it, so a format change is visible", () => {
    expect(renderRecord(assistantRecord([{ type: "image", source: {} }]))).toEqual([{ kind: "unknown", text: "[unknown block: image]" }]);
  });

  it("renders a block that is not even an object", () => {
    expect(renderRecord(assistantRecord([null]))).toEqual([{ kind: "unknown", text: "[unknown block: ?]" }]);
  });

  it("contributes nothing for a record with no message, and none for content of an unknown shape", () => {
    expect(renderRecord({ type: "summary", summary: "…", leafUuid: "u" })).toEqual([]);
    expect(renderRecord({ type: "user", message: { content: 42 } })).toEqual([]);
    expect(renderRecord(assistantRecord([]))).toEqual([]);
  });

  describe("broken fields still produce a string", () => {
    it("falls back to unknown when tool_use has no usable name", () => {
      expect(renderRecord(assistantRecord([{ type: "tool_use", id: "t", input: {} }]))).toEqual([{ kind: "unknown", text: "[unknown block: tool_use]" }]);
      expect(renderRecord(assistantRecord([{ type: "tool_use", id: "t", name: 7 }]))).toEqual([{ kind: "unknown", text: "[unknown block: tool_use]" }]);
    });

    it("drops a text block with no usable text — an empty row carries nothing", () => {
      expect(renderRecord(assistantRecord([{ type: "text" }]))).toEqual([]);
      expect(renderRecord(assistantRecord([{ type: "text", text: 5 }]))).toEqual([]);
      expect(renderRecord(assistantRecord([{ type: "text", text: "" }]))).toEqual([]);
    });
  });

  describe("tool_result content", () => {
    it("passes a string through", () => {
      expect(renderRecord(toolResultRecord("ok"))).toEqual([{ kind: "tool", text: "ok" }]);
    });

    it("keeps an EMPTY string as one empty row — 'the tool ran and said nothing' is information", () => {
      expect(renderRecord(toolResultRecord(""))).toEqual([{ kind: "tool", text: "" }]);
    });

    it("joins an array's text parts with newlines and stringifies the rest", () => {
      const rows = renderRecord(
        toolResultRecord([
          { type: "text", text: "first" },
          { type: "image", source: { kind: "b64" } },
          { type: "text", text: "third" },
        ]),
      );
      expect(rows).toEqual([{ kind: "tool", text: `first\n{"type":"image","source":{"kind":"b64"}}\nthird` }]);
    });

    it("makes no row for an array that yields nothing — unlike the empty string, there was no piece", () => {
      expect(renderRecord(toolResultRecord([]))).toEqual([]);
      expect(renderRecord(toolResultRecord([undefined]))).toEqual([]);
    });

    it("stringifies a content shape it has never seen", () => {
      expect(renderRecord(toolResultRecord({ stdout: "hi" }))).toEqual([{ kind: "tool", text: '{"stdout":"hi"}' }]);
    });

    it(`keeps the first ${TOOL_RESULT_MAX_LINES} lines and marks the row clipped`, () => {
      const rows = renderRecord(toolResultRecord("l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8"));
      expect(rows).toEqual([{ kind: "tool", text: "l1\nl2\nl3\nl4\nl5\nl6", clipped: true }]);
    });

    it("does not mark a result that fits", () => {
      expect(renderRecord(toolResultRecord("l1\nl2"))).toEqual([{ kind: "tool", text: "l1\nl2" }]);
    });

    it("counts the empty element a trailing newline makes, or 6 lines would arrive as 7", () => {
      // Six lines and a trailing newline: split() yields seven elements, so this IS clipped.
      const rows = renderRecord(toolResultRecord("l1\nl2\nl3\nl4\nl5\nl6\n"));
      expect(rows).toEqual([{ kind: "tool", text: "l1\nl2\nl3\nl4\nl5\nl6", clipped: true }]);
    });
  });
});

describe("foldTranscriptView", () => {
  it("groups each prompt with everything that followed it", () => {
    const view = okView(
      viewOf([
        userRecord("first"),
        assistantRecord([{ type: "tool_use", id: "t", name: "Read" }]),
        toolResultRecord("file contents"),
        assistantRecord([{ type: "text", text: "read it" }]),
        userRecord("second"),
        assistantRecord([{ type: "text", text: "done" }]),
      ]),
    );
    expect(view.turns).toHaveLength(2);
    expect(view.turns[0]?.rows.map((row) => row.text)).toEqual(["first", "Read", "file contents", "read it"]);
    expect(view.turns[1]?.rows.map((row) => row.text)).toEqual(["second", "done"]);
  });

  it("takes `at` from the BOUNDARY record, not from a later one in the same turn", () => {
    const view = okView(viewOf([userRecord("go", { timestamp: "2026-08-18T09:00:00.000Z" }), assistantRecord([{ type: "text", text: "ok" }])]));
    expect(view.turns[0]?.at).toBe("2026-08-18T09:00:00.000Z");
  });

  it("keeps the turn with a null `at` when the timestamp is not a string", () => {
    const view = okView(viewOf([userRecord("go", { timestamp: 1755000000000 })]));
    expect(view.turns[0]?.at).toBeNull();
    expect(view.turns[0]?.rows).toHaveLength(1);
  });

  it("drops the fragment before the first boundary and says the view is truncated", () => {
    const view = okView(
      viewOf([
        assistantRecord([{ type: "text", text: "tail of the turn already running" }]),
        toolResultRecord("stray result"),
        userRecord("the first prompt in the window"),
      ]),
    );
    expect(view.turns).toHaveLength(1);
    expect(view.turns[0]?.rows.map((row) => row.text)).toEqual(["the first prompt in the window"]);
    expect(view.truncated).toBe(true);
  });

  it("does not count that fragment against the budget", () => {
    const scan = scanOf([assistantRecord([{ type: "text", text: "x\n".repeat(400) }]), userRecord("prompt")]);
    expect(scan.lines).toBe(1);
  });

  it("does NOT call it truncated when the records before the first prompt render nothing", () => {
    // Measured on this machine: most transcripts open with these, so marking every pre-boundary
    // record would put "there is more before this" on a conversation that is entirely present.
    const view = okView(
      viewOf([{ type: "queue-operation", timestamp: "2026-08-18T00:00:00.000Z" }, { type: "attachment", isSidechain: false }, userRecord("the first prompt")]),
    );
    expect(view.turns).toHaveLength(1);
    expect(view.truncated).toBe(false);
  });

  describe("sidechain records", () => {
    it("drops a sub-agent's prompt so it is not a turn", () => {
      const view = okView(viewOf([userRecord("real prompt"), userRecord("sub-agent prompt", { isSidechain: true })]));
      expect(view.turns).toHaveLength(1);
    });

    it("drops a sub-agent's assistant record so it does not land in the previous turn", () => {
      const view = okView(
        viewOf([
          userRecord("real prompt"),
          assistantRecord([{ type: "text", text: "mine" }]),
          assistantRecord([{ type: "text", text: "the sub-agent's" }], { isSidechain: true }),
        ]),
      );
      expect(view.turns[0]?.rows.map((row) => row.text)).toEqual(["real prompt", "mine"]);
    });
  });

  describe("the line budget", () => {
    // 120 logical lines per turn (the prompt plus 119 body lines), so three turns are 360 and the
    // budget must evict — and evicting exactly one brings it to 240, under the budget.
    const bulkyTurn = (label: string) => [userRecord(label), assistantRecord([{ type: "text", text: `${label}-body\n`.repeat(119).trimEnd() }])];

    it("evicts WHOLE turns, oldest first, once the logical lines exceed the budget", () => {
      const view = okView(viewOf(["a", "b", "c"].flatMap(bulkyTurn)));
      expect(view.turns.map((turn) => turn.rows[0]?.text)).toEqual(["b", "c"]);
      expect(view.truncated).toBe(true);
    });

    it("never evicts the only turn there is, however big it is", () => {
      const huge = [userRecord("one"), assistantRecord([{ type: "text", text: "line\n".repeat(TRANSCRIPT_LINE_BUDGET * 4) }])];
      const view = okView(viewOf(huge));
      expect(view.turns).toHaveLength(1);
      expect(view.turns[0]?.rows[0]?.text).toBe("one");
    });

    it("counts LINES, not row objects — one answer with 900 newlines fills the budget", () => {
      // Were the budget counting rows, three rows would never evict anything.
      const view = okView(viewOf([userRecord("old"), assistantRecord([{ type: "text", text: "x\n".repeat(TRANSCRIPT_LINE_BUDGET + 10) }]), userRecord("new")]));
      expect(view.turns.map((turn) => turn.rows[0]?.text)).toEqual(["new"]);
      expect(view.truncated).toBe(true);
    });

    it("leaves `truncated` false when nothing was dropped and the window began at the file's head", () => {
      const view = okView(viewOf([userRecord("only"), assistantRecord([{ type: "text", text: "short" }])]));
      expect(view.truncated).toBe(false);
    });
  });
});

describe("transcriptViewOf", () => {
  it("reports `none` when no boundary was ever seen", () => {
    expect(viewOf([assistantRecord([{ type: "text", text: "orphan" }])])).toEqual({ status: "none" });
  });

  it("sends no `undefined` at any depth — Firestore rejects the whole command doc over one", () => {
    // #1042: `clipped` is optional, and optional on this wire has to mean the KEY IS ABSENT. A row
    // carrying `clipped: undefined` would not lose its mark, it would lose the entire reply.
    const view = viewOf([
      userRecord("go", { timestamp: 7 }),
      assistantRecord([{ type: "tool_use", id: "t", name: "Read" }]),
      toolResultRecord("a\nb\nc\nd\ne\nf\ng"),
    ]);
    expect(undefinedPaths(toJsonObject(view))).toEqual([]);
  });

  it("says truncated when the window did not start at the file's head, even with nothing evicted", () => {
    // Nothing fired the line budget: the tail read is what dropped the older turns, and only the
    // reader knows that. Without this a cut history arrives claiming to be the whole one.
    const view = okView(viewOf([userRecord("only"), assistantRecord([{ type: "text", text: "short" }])], true));
    expect(view.truncated).toBe(true);
  });

  describe("the byte cap", () => {
    // 40 KB of text per turn, so seven turns pass 256 KB. Kept under the line budget (one line
    // each) so this test can only be failing the BYTE rule.
    const fatTurn = (label: string) => [userRecord(label), assistantRecord([{ type: "text", text: `${label}${"x".repeat(40 * 1024)}` }])];

    const viewBytes = (view: TranscriptView): number => Buffer.byteLength(JSON.stringify(view), "utf8");

    it("drops the oldest turns and marks the view truncated", () => {
      const view = okView(viewOf(["a", "b", "c", "d", "e", "f", "g"].flatMap(fatTurn)));
      expect(view.turns.length).toBeLessThan(7);
      expect(view.turns[view.turns.length - 1]?.rows[0]?.text).toBe("g");
      expect(view.truncated).toBe(true);
      expect(viewBytes(view)).toBeLessThan(TRANSCRIPT_MAX_BYTES);
    });

    it("keeps the newest turn when it exceeds the cap ALONE, clipping its rows instead", () => {
      const view = okView(viewOf([userRecord("huge"), assistantRecord([{ type: "text", text: "y".repeat(TRANSCRIPT_MAX_BYTES * 2) }])]));
      expect(view.status).toBe("ok"); // never "too-large": the file read fine, it is only big
      expect(view.turns).toHaveLength(1);
      expect(view.turns[0]?.rows[0]?.text).toBe("huge"); // the prompt survives whole
      expect(view.turns[0]?.rows[1]?.clipped).toBe(true);
      expect(view.truncated).toBe(true);
      expect(viewBytes(view)).toBeLessThan(TRANSCRIPT_MAX_BYTES);
    });

    it("cuts on a character boundary, so a Japanese turn stays valid UTF-8", () => {
      const view = okView(viewOf([userRecord("日本語"), assistantRecord([{ type: "text", text: "あ".repeat(TRANSCRIPT_MAX_BYTES) }])]));
      const clipped = view.turns[0]?.rows[1]?.text ?? "";
      expect(clipped).not.toContain("�"); // U+FFFD is what a split sequence decodes to
      expect(Buffer.from(clipped, "utf8").toString("utf8")).toBe(clipped);
    });
  });
});

describe("clipToBytes", () => {
  it("measures BYTES, not characters", () => {
    expect(clipToBytes("あいう", 6)).toBe("あい"); // 3 bytes each
  });

  it("never splits a character", () => {
    expect(clipToBytes("あいう", 7)).toBe("あい");
    expect(clipToBytes("あいう", 8)).toBe("あい");
    expect(clipToBytes("あいう", 9)).toBe("あいう");
  });

  it("returns the text untouched when it already fits, and nothing at a non-positive budget", () => {
    expect(clipToBytes("hello", 99)).toBe("hello");
    expect(clipToBytes("hello", 0)).toBe("");
    expect(clipToBytes("hello", -5)).toBe("");
  });
});
