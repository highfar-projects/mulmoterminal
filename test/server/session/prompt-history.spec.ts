// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  claudeHistoryPrompt,
  claudePromptsFor,
  codexPrompts,
  transcriptPrompts,
  PROMPT_TEXT_CAP,
  PROMPT_HISTORY_MAX,
} from "../../../server/session/prompt-history";

// A ~/.claude/history.jsonl line, as claude writes it (verified against the real file, #1748).
const historyLine = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  display: "make the header green",
  pastedContents: {},
  timestamp: 1786847885862,
  project: "/Users/me/repo",
  sessionId: "s1",
  ...over,
});

// A codex rollout row: the payload type is what identifies it, and the outer type must be
// event_msg — a response_item carrying the same payload type is a different record.
const codexLine = (message: unknown, ts = "2026-08-16T02:31:02.318Z"): Record<string, unknown> => ({
  type: "event_msg",
  timestamp: ts,
  payload: { type: "user_message", message },
});

describe("claudeHistoryPrompt", () => {
  it("reads the text, the time and the session off a real line", () => {
    expect(claudeHistoryPrompt(historyLine())).toEqual({
      sessionId: "s1",
      prompt: { at: 1786847885862, text: "make the header green" },
    });
  });

  it("drops a record with no session id — it cannot be scoped to a cell", () => {
    expect(claudeHistoryPrompt(historyLine({ sessionId: undefined }))).toBeNull();
    expect(claudeHistoryPrompt(historyLine({ sessionId: 42 }))).toBeNull();
  });

  it("drops a record whose text is absent, blank or not a string", () => {
    expect(claudeHistoryPrompt(historyLine({ display: undefined }))).toBeNull();
    expect(claudeHistoryPrompt(historyLine({ display: "   " }))).toBeNull();
    expect(claudeHistoryPrompt(historyLine({ display: { text: "no" } }))).toBeNull();
  });

  it("keeps the prompt when only the TIME is unreadable", () => {
    expect(claudeHistoryPrompt(historyLine({ timestamp: "not a date" }))?.prompt).toEqual({ at: null, text: "make the header green" });
    expect(claudeHistoryPrompt(historyLine({ timestamp: undefined }))?.prompt.at).toBeNull();
  });

  it("caps a pasted wall of text, marking that it was cut", () => {
    const long = "x".repeat(PROMPT_TEXT_CAP + 500);
    const read = claudeHistoryPrompt(historyLine({ display: long }));
    expect(read?.prompt.text).toHaveLength(PROMPT_TEXT_CAP + 1);
    expect(read?.prompt.text.endsWith("…")).toBe(true);
  });
});

describe("claudePromptsFor", () => {
  it("keeps only this session's prompts, oldest first", () => {
    const records = [
      historyLine({ display: "one", timestamp: 1 }),
      historyLine({ display: "elsewhere", sessionId: "s2", timestamp: 2 }),
      historyLine({ display: "two", timestamp: 3 }),
    ];
    expect(claudePromptsFor(records, "s1")).toEqual([
      { at: 1, text: "one" },
      { at: 3, text: "two" },
    ]);
  });

  it("keeps the NEWEST when there are more than the limit", () => {
    const records = Array.from({ length: 5 }, (_, i) => historyLine({ display: `p${i}`, timestamp: i }));
    expect(claudePromptsFor(records, "s1", 2)).toEqual([
      { at: 3, text: "p3" },
      { at: 4, text: "p4" },
    ]);
  });

  it("keeps trivial acks — 'merge' and 'ok' are instructions here, not noise", () => {
    const records = [historyLine({ display: "ok", timestamp: 1 }), historyLine({ display: "merge", timestamp: 2 })];
    expect(claudePromptsFor(records, "s1").map((p) => p.text)).toEqual(["ok", "merge"]);
  });

  it("answers empty for no records, no match, and records of the wrong shape", () => {
    expect(claudePromptsFor([], "s1")).toEqual([]);
    expect(claudePromptsFor([historyLine()], "other")).toEqual([]);
    expect(claudePromptsFor([{}, { display: "x" }, { sessionId: "s1" }], "s1")).toEqual([]);
  });

  it("defaults to PROMPT_HISTORY_MAX rather than serving an unbounded list", () => {
    const records = Array.from({ length: PROMPT_HISTORY_MAX + 10 }, (_, i) => historyLine({ display: `p${i}`, timestamp: i }));
    expect(claudePromptsFor(records, "s1")).toHaveLength(PROMPT_HISTORY_MAX);
  });
});

describe("codexPrompts", () => {
  it("reads user_message events, with the ISO timestamp as epoch ms", () => {
    expect(codexPrompts([codexLine("review the branch")])).toEqual([{ at: Date.parse("2026-08-16T02:31:02.318Z"), text: "review the branch" }]);
  });

  it("ignores every other record — including a payload of the same type that is not an event_msg", () => {
    const notAnEvent = { type: "response_item", timestamp: "2026-08-16T02:31:02.318Z", payload: { type: "user_message", message: "no" } };
    const otherEvent = { type: "event_msg", payload: { type: "agent_message", message: "no" } };
    expect(codexPrompts([notAnEvent, otherEvent, {}, { payload: null }])).toEqual([]);
  });

  it("drops a message that is blank or not a string, and keeps the newest within the limit", () => {
    const records = [codexLine(""), codexLine({ text: "no" }), codexLine("a"), codexLine("b")];
    expect(codexPrompts(records, 1)).toEqual([{ at: Date.parse("2026-08-16T02:31:02.318Z"), text: "b" }]);
  });
});

describe("transcriptPrompts (the fallback)", () => {
  const userRecord = (content: unknown, timestamp = "2026-08-16T02:31:02.318Z") => ({ type: "user", timestamp, message: { role: "user", content } });

  it("reads plain and block content", () => {
    const records = [userRecord("typed"), userRecord([{ type: "text", text: "blocks" }])];
    expect(transcriptPrompts(records).map((p) => p.text)).toEqual(["typed", "blocks"]);
  });

  it("skips harness-injected user records and tool results", () => {
    const records = [
      userRecord("<local-command-stdout>ran</local-command-stdout>"),
      userRecord("<task-notification>done</task-notification>"),
      userRecord([{ type: "tool_result", tool_use_id: "t1", content: "output" }]),
      { type: "assistant", message: { content: "not a prompt" } },
    ];
    expect(transcriptPrompts(records)).toEqual([]);
  });

  it("answers empty rather than throwing on records of the wrong shape", () => {
    expect(transcriptPrompts([{ type: "user" }, { type: "user", message: "text" }, {}])).toEqual([]);
  });
});
