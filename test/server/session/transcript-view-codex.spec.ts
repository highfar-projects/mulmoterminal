// @vitest-environment node
//
// Codex's half of the phone's conversation view (#1822), and the property that keeps claude's half
// from drifting away from it.
//
// The generator at the bottom is what survives a differential harness run: old-vs-new
// `foldTranscriptView` was compared over 400 real claude transcripts and 4,000 generated sequences
// (167,148 records, 0 mismatches) when the agent-neutral `foldTurnRecord` was extracted. That
// harness could not survive — half of it was the code it replaced — but the two things worth
// keeping did: WHICH record shapes matter, and WHAT must hold once the old code is gone.
import { describe, it, expect } from "vitest";
import { createCodexFold, renderCodexRecord } from "../../../server/session/transcript-view-codex";
import {
  emptyTranscriptScan,
  foldTranscriptView,
  foldTurnRecord,
  renderRecord,
  turnBoundaryPrompt,
  transcriptViewOf,
  TOOL_RESULT_MAX_LINES,
} from "../../../server/session/transcript-view";

const rollout = (payload: Record<string, unknown>, timestamp = "2026-08-23T05:18:28.228Z") => ({
  timestamp,
  type: "response_item",
  payload,
});
const eventMsg = (payload: Record<string, unknown>) => ({ timestamp: "2026-08-23T05:18:29.000Z", type: "event_msg", payload });

const userMessage = (text: string) => rollout({ type: "message", role: "user", content: [{ type: "input_text", text }] });
const assistantMessage = (text: string) => rollout({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });

const foldAll = (records: Record<string, unknown>[]) => {
  const scan = emptyTranscriptScan();
  const fold = createCodexFold(scan);
  records.forEach(fold);
  return scan;
};

describe("renderCodexRecord", () => {
  it("renders an assistant message as prose", () => {
    expect(renderCodexRecord(assistantMessage("I'll inspect the PR."))).toEqual([{ kind: "assistant", text: "I'll inspect the PR." }]);
  });

  // TRAP 1, measured: in the sampled rollout BOTH `role: "user"` messages are codex's own preamble
  // — `<recommended_plugins>` and `<environment_context>`. Rendering them would put codex's
  // bookkeeping on the phone as if the person had typed it.
  it("renders nothing for a user or developer message — the boundary owns the prompt", () => {
    expect(renderCodexRecord(userMessage("<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>"))).toEqual([]);
    expect(renderCodexRecord(rollout({ type: "message", role: "developer", content: [{ type: "input_text", text: "<skills>" }] }))).toEqual([]);
  });

  it("names a tool call and shows the head of its arguments", () => {
    const row = renderCodexRecord(rollout({ type: "function_call", name: "exec_command", arguments: '{"cmd":"git diff"}' }));
    expect(row).toEqual([{ kind: "tool", text: 'exec_command {"cmd":"git diff"}' }]);
  });

  it("clips a long argument string rather than carrying the whole invocation", () => {
    const [row] = renderCodexRecord(rollout({ type: "function_call", name: "exec_command", arguments: "x".repeat(4000) }));
    expect(row?.text.length).toBeLessThan(260);
    expect(row?.text.endsWith("…")).toBe(true);
  });

  it("falls back to a name for a tool call that has none", () => {
    expect(renderCodexRecord(rollout({ type: "function_call", arguments: "" }))).toEqual([{ kind: "tool", text: "(unnamed tool)" }]);
  });

  // The same cap claude's tool results get, and from the same function — a result must not be six
  // lines for one agent and whole for another.
  it("caps a tool result at claude's line budget and marks it clipped", () => {
    const out = Array.from({ length: TOOL_RESULT_MAX_LINES + 4 }, (_, i) => `line ${i}`).join("\n");
    const [row] = renderCodexRecord(rollout({ type: "function_call_output", output: out }));
    expect(row?.text.split("\n")).toHaveLength(TOOL_RESULT_MAX_LINES);
    expect(row?.clipped).toBe(true);
  });

  // TRAP 3, measured: `summary: []` and an encrypted body — there is nothing to show.
  it("renders nothing for reasoning, accounting and the item stream", () => {
    expect(renderCodexRecord(rollout({ type: "reasoning", summary: [], encrypted_content: "gAAAA" }))).toEqual([]);
    expect(renderCodexRecord(eventMsg({ type: "token_count", info: {} }))).toEqual([]);
    expect(renderCodexRecord(eventMsg({ type: "item_completed", item: {} }))).toEqual([]);
    expect(renderCodexRecord({ type: "session_meta", payload: { id: "x" } })).toEqual([]);
  });

  it("renders nothing for a record with no payload at all", () => {
    expect(renderCodexRecord({})).toEqual([]);
    expect(renderCodexRecord({ type: "response_item", payload: "not a record" })).toEqual([]);
  });
});

describe("createCodexFold", () => {
  it("opens a turn on the person's prompt and hangs the reply under it", () => {
    const scan = foldAll([userMessage("what changed?"), assistantMessage("this and that")]);
    expect(scan.turns).toHaveLength(1);
    expect(scan.turns[0]?.rows).toEqual([
      { kind: "user", text: "what changed?" },
      { kind: "assistant", text: "this and that" },
    ]);
  });

  // TRAP 1 again, at the fold rather than the renderer: codex's wrapper messages must not open
  // turns, or every exchange fuses into one the line budget can never evict.
  it("does not open a turn for codex's own preamble", () => {
    const scan = foldAll([userMessage("<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>"), assistantMessage("hi")]);
    expect(scan.turns).toHaveLength(0);
  });

  // TRAP 2, measured at 924 pairs in the store: one prompt written as a response_item and then
  // immediately again as an event_msg. Two turns here means every prompt shown twice, with an empty
  // turn between them.
  it("opens ONE turn for a prompt codex wrote in both shapes", () => {
    const scan = foldAll([userMessage("run the tests"), eventMsg({ type: "user_message", message: "run the tests" }), assistantMessage("done")]);
    expect(scan.turns).toHaveLength(1);
    expect(scan.turns[0]?.rows.filter((r) => r.kind === "user")).toHaveLength(1);
  });

  // The other side of that rule: a person really can send the same text twice, and those turns are
  // the same shape with a reply between them.
  it("keeps two turns when the person sent the same text twice", () => {
    const scan = foldAll([userMessage("again"), assistantMessage("ok"), userMessage("again"), assistantMessage("ok")]);
    expect(scan.turns).toHaveLength(2);
  });

  it("carries the boundary record's timestamp as the turn's start", () => {
    const scan = foldAll([userMessage("when")]);
    expect(scan.turns[0]?.at).toBe("2026-08-23T05:18:28.228Z");
  });

  it("drops a pre-boundary fragment and says the view is truncated", () => {
    const scan = foldAll([assistantMessage("tail of an older turn"), userMessage("new question")]);
    expect(scan.truncated).toBe(true);
    expect(scan.turns).toHaveLength(1);
  });

  it("answers `none` for a rollout with no prompt in the window", () => {
    expect(transcriptViewOf(foldAll([assistantMessage("orphan")]), false)).toEqual({ status: "none" });
  });
});

// ── the property harvested from the differential harness ──────────────────────────────────────
//
// `foldTranscriptView` is now `foldTurnRecord` plus claude's three readers. That decomposition is
// the thing the harness proved and the thing a future edit can silently break — a renderer moved
// into the wrong half, a sidechain check dropped, the timestamp read at the wrong level. The
// generator is the one from the harness: the record shapes that actually occur, plus the malformed
// ones that do not.
describe("claude's fold is exactly the shared fold plus claude's renderers", () => {
  const shapes: (() => Record<string, unknown>)[] = [
    () => ({ type: "user", message: { content: "hello" }, timestamp: "2026-09-15T00:00:00.000Z" }),
    () => ({ type: "user", message: { content: [{ type: "text", text: "block prompt" }] } }),
    () => ({ type: "user", isSidechain: true, message: { content: "sub-agent" } }),
    () => ({ type: "assistant", message: { content: [{ type: "text", text: "a\nb\nc" }] } }),
    () => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }),
    () => ({ type: "user", message: { content: [{ type: "tool_result", content: "1\n2\n3\n4\n5\n6\n7\n8" }] } }),
    () => ({ type: "assistant", message: { content: [{ type: "thinking", thinking: "" }] } }),
    () => ({ type: "assistant", message: { content: [{ type: "mystery", x: 1 }] } }),
    () => ({ type: "user", message: { content: `${"x".repeat(300)}\n${"y\n".repeat(300)}` } }),
    () => ({ type: "user", message: { content: "t" }, timestamp: "z".repeat(200) }),
    () => ({ type: "summary" }),
    () => ({ type: "user", message: {} }),
    () => ({}),
  ];

  it("agrees over 2000 generated sequences", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let n = 0; n < 2000; n++) {
      const records = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => shapes[Math.floor(rnd() * shapes.length)]?.() ?? {});
      const viaClaude = emptyTranscriptScan();
      const viaShared = emptyTranscriptScan();
      for (const record of records) {
        foldTranscriptView(viaClaude, record);
        // Claude's three readers, spelled out. A sidechain record is dropped WHOLE — not merely
        // disqualified as a boundary — or its rows land in whichever turn happens to be open.
        if (record.isSidechain === true) continue;
        foldTurnRecord(viaShared, {
          prompt: turnBoundaryPrompt(record),
          at: typeof record.timestamp === "string" ? record.timestamp : null,
          rows: renderRecord(record),
        });
      }
      expect(JSON.stringify(viaShared), `sequence ${n}`).toBe(JSON.stringify(viaClaude));
    }
  });
});
