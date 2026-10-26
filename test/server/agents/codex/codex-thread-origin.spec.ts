// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sessionSourceKind, isResumableThread } from "../../../../server/agents/codex/codex-thread-origin.js";
import type { SessionSourceKind, ThreadOrigin } from "../../../../server/agents/codex/codex-thread-origin.js";

describe("sessionSourceKind", () => {
  // The shapes codex's `SessionSource` serialises to: a unit variant is a lowercase string, a
  // variant with data is an object whose one key is the variant.
  it.each([
    ["cli", "cli"],
    ["vscode", "vscode"],
    ["exec", "exec"],
    ["mcp", "mcp"],
    ["unknown", "unknown"],
    ["a custom frontend", { custom: "atlas" }],
  ])("reads %s as a root thread", (_label, source) => {
    expect(sessionSourceKind(source)).toBe("root");
  });

  it.each([
    ["a /review fork", { subagent: "review" }],
    ["a compaction fork", { subagent: "compact" }],
    ["a spawned agent", { subagent: { thread_spawn: { parent_thread_id: "p", depth: 1 } } }],
    ["a guardian review (#3198)", { subagent: { other: "guardian" } }],
    ["a kind codex has not added yet", { subagent: { other: "whatever_comes_next" } }],
  ])("reads %s as a subagent", (_label, source) => {
    expect(sessionSourceKind(source)).toBe("subagent");
  });

  it.each([
    ["memory consolidation", { internal: "memory_consolidation" }],
    ["the guardian host", { internal: "guardian" }],
    ["a kind codex has not added yet", { internal: "whatever_comes_next" }],
  ])("reads %s as internal", (_label, source) => {
    expect(sessionSourceKind(source)).toBe("internal");
  });

  // Absent or malformed is a root thread: dropping a row costs a person their conversation,
  // listing one costs them a scroll.
  it.each([
    ["absent", undefined],
    ["null", null],
    ["a number", 7],
    ["a boolean", true],
    ["an array naming the variant", ["subagent"]],
    ["an empty object", {}],
    ["the variant with the wrong case", { Subagent: "review" }],
    ["the inner shape without its key", { other: "guardian" }],
  ])("reads %s as a root thread", (_label, source) => {
    expect(sessionSourceKind(source)).toBe("root");
  });
});

describe("isResumableThread", () => {
  const origin = (sourceKind: SessionSourceKind, threadSource: string | null): ThreadOrigin => ({ sourceKind, threadSource });

  // A deny-list on purpose: an allow-list of "user" would make each new codex thread kind vanish
  // from the listing silently, which is the failure mode #1777 was about.
  it.each(["user", "realtime_voice", "some_future_kind", "", null])("keeps a root thread whose thread_source is %j", (threadSource) => {
    expect(isResumableThread(origin("root", threadSource))).toBe(true);
  });

  it.each(["subagent", "guardian_review", "memory_consolidation", "automation"])(
    "suppresses a root-shaped thread whose thread_source is %s",
    (threadSource) => {
      expect(isResumableThread(origin("root", threadSource))).toBe(false);
    },
  );

  // The structural rule needs no name: a thread codex spawned is machinery whatever it is for.
  it.each<[SessionSourceKind, string | null]>([
    ["subagent", "user"],
    ["subagent", null],
    ["subagent", "some_future_kind"],
    ["internal", "memory_consolidation"],
    ["internal", null],
    ["internal", "user"],
  ])("suppresses a %s thread whose thread_source is %j", (sourceKind, threadSource) => {
    expect(isResumableThread(origin(sourceKind, threadSource))).toBe(false);
  });
});
