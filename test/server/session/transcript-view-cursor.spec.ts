// @vitest-environment node
//
// Cursor's half of the phone's conversation view (#1822), measured over EVERY cursor transcript on
// this machine — all 35 of them, not a sample. The whole store holds exactly three record kinds
// (`role: user`, `role: assistant`, `type: turn_ended`) and three content parts (user/text,
// assistant/text, assistant/tool_use).
//
// That store is SMALL and mostly this project's own probes, which is the reason the unknown-part
// row below is load-bearing rather than ceremonial: the shapes this store never showed us are the
// ones a future cursor release will.
import { describe, it, expect } from "vitest";
import { createCursorFold, cursorTurnPrompt, renderCursorRecord } from "../../../server/session/transcript-view-cursor";
import { emptyTranscriptScan, transcriptViewOf } from "../../../server/session/transcript-view";

const user = (text: string) => ({ role: "user", message: { content: [{ type: "text", text }] } });
const wrapped = (prompt: string) => user(`<timestamp>Monday, Sep 14, 2026, 8:46 AM (UTC+9)</timestamp>\n<user_query>\n${prompt}\n</user_query>`);
const assistant = (...parts: unknown[]) => ({ role: "assistant", message: { content: parts } });
const say = (text: string) => assistant({ type: "text", text });
const toolUse = (name: string, input: unknown) => assistant({ type: "tool_use", name, input });
const ended = () => ({ type: "turn_ended", status: "success" });

const foldAll = (records: Record<string, unknown>[]) => {
  const scan = emptyTranscriptScan();
  const fold = createCursorFold(scan);
  records.forEach(fold);
  return scan;
};

describe("cursorTurnPrompt", () => {
  // TRAP 1: the prompt arrives wrapped, and cursor does NOT escape the marker — a prompt containing
  // the literal `</user_query>` is stored verbatim inside the wrapper (measured in #2072).
  it("unwraps the prompt and drops the timestamp block", () => {
    expect(cursorTurnPrompt(wrapped("what changed?"))).toBe("what changed?");
  });

  it("keeps a prompt that contains the closing marker as literal text", () => {
    expect(cursorTurnPrompt(wrapped("note this: </user_query> and more"))).toBe("note this: </user_query> and more");
  });

  it("is not a boundary for an assistant record or a turn_ended", () => {
    expect(cursorTurnPrompt(say("hello"))).toBeNull();
    expect(cursorTurnPrompt(ended())).toBeNull();
  });

  it("is not a boundary for a user record with no text in it", () => {
    expect(cursorTurnPrompt({ role: "user", message: { content: [] } })).toBeNull();
  });
});

describe("renderCursorRecord", () => {
  it("renders assistant prose", () => {
    expect(renderCursorRecord(say("None — this is the first message."))).toEqual([{ kind: "assistant", text: "None — this is the first message." }]);
  });

  // TRAP 2: cursor's `input` is an OBJECT, where codex's two families both carry a string.
  it("names a tool call and serialises its object input", () => {
    const rows = renderCursorRecord(toolUse("Shell", { command: "echo E2EOK", description: "Echo E2EOK to stdout" }));
    expect(rows).toEqual([{ kind: "tool", text: 'Shell {"command":"echo E2EOK","description":"Echo E2EOK to stdout"}' }]);
  });

  it("clips a long input rather than carrying the whole invocation", () => {
    const [row] = renderCursorRecord(toolUse("Write", { contents: "x".repeat(4000) }));
    expect(row?.text.length).toBeLessThan(260);
    expect(row?.text.endsWith("…")).toBe(true);
  });

  // Polled every five seconds per open session: a value that will not serialise must not throw.
  it("survives an input that cannot be serialised", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(renderCursorRecord(toolUse("Weird", cyclic))).toEqual([{ kind: "tool", text: "Weird" }]);
  });

  // A USER record renders nothing: its text is the turn's prompt, which the fold lays down as the
  // turn's first row. Rendering it here as well would print every prompt twice.
  it("renders nothing for a user record — the boundary owns the prompt", () => {
    expect(renderCursorRecord(wrapped("asked once"))).toEqual([]);
  });

  // The load-bearing fallback. This store is 35 transcripts and holds three part types; a future
  // cursor release will hold a fourth, and it must arrive VISIBLE rather than thinning the view.
  it("renders an unrecognised content block as an unknown row carrying the block itself", () => {
    // `describeValue` serialises it, which is the point: the row SHOWS what arrived, so a shape
    // this store never held is legible on the phone rather than merely counted.
    expect(renderCursorRecord(assistant({ type: "thinking", body: "…" }))).toEqual([{ kind: "unknown", text: '{"type":"thinking","body":"…"}' }]);
    expect(renderCursorRecord(assistant("a bare string"))).toEqual([{ kind: "unknown", text: "a bare string" }]);
  });

  // TRAP 3 stated as a test, because it is the thing a reader will wonder about: cursor writes NO
  // tool results anywhere in its transcript — zero across the whole store. If a future release adds
  // one, this is the assertion that changes, and the unknown row above is what shows it first.
  it("has no tool-result part to render, and shows an unfamiliar one rather than hiding it", () => {
    expect(renderCursorRecord(assistant({ type: "tool_result", content: "exit 0" }))).toEqual([
      { kind: "unknown", text: '{"type":"tool_result","content":"exit 0"}' },
    ]);
  });
});

describe("createCursorFold", () => {
  it("opens a turn on the prompt and hangs the reply under it", () => {
    const scan = foldAll([wrapped("what changed?"), say("this and that"), ended()]);
    expect(scan.turns).toHaveLength(1);
    expect(scan.turns[0]?.rows).toEqual([
      { kind: "user", text: "what changed?" },
      { kind: "assistant", text: "this and that" },
    ]);
  });

  it("keeps the tool calls of a turn in the order they ran", () => {
    const scan = foldAll([wrapped("run it"), toolUse("Read", { path: "/a" }), toolUse("Shell", { command: "ls" }), say("done"), ended()]);
    expect(scan.turns[0]?.rows.map((row) => row.kind)).toEqual(["user", "tool", "tool", "assistant"]);
  });

  it("opens one turn per prompt", () => {
    const scan = foldAll([wrapped("first"), say("a"), ended(), wrapped("second"), say("b"), ended()]);
    expect(scan.turns).toHaveLength(2);
    expect(scan.turns[1]?.rows[0]).toEqual({ kind: "user", text: "second" });
  });

  it("renders nothing for turn_ended", () => {
    const scan = foldAll([wrapped("q"), ended()]);
    expect(scan.turns[0]?.rows).toEqual([{ kind: "user", text: "q" }]);
  });

  // Cursor's records carry no timestamp field at all — the `<timestamp>` in the wrapper is prose
  // inside the prompt, not a field. A turn with no clock keeps its content.
  it("answers a null time rather than dropping the turn", () => {
    expect(foldAll([wrapped("no clock")]).turns[0]?.at).toBeNull();
  });

  it("drops a pre-boundary fragment and says the view is truncated", () => {
    const scan = foldAll([say("tail of an older turn"), wrapped("new question")]);
    expect(scan.truncated).toBe(true);
    expect(scan.turns).toHaveLength(1);
  });

  it("answers `none` for a window with no prompt in it", () => {
    expect(transcriptViewOf(foldAll([say("orphan"), ended()]), false)).toEqual({ status: "none" });
  });
});
