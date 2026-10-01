import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { ToolCall } from "../../../src/components/toolCall";

// What the feed hands useSessionFeed, typed by the fields this spec reads.
interface CapturedOptions {
  sessionId: () => string | null;
  historyUrl: (id: string) => string;
  historyKey: string;
  channel: (id: string) => string;
  identify: (call: ToolCall) => string | undefined;
  parse: unknown;
  onSessionChange?: () => void;
}

const { feedCalls } = vi.hoisted(() => {
  const captured: { items: unknown; options: CapturedOptions }[] = [];
  return { feedCalls: captured };
});
vi.mock("../../../src/composables/useSessionFeed", () => ({
  useSessionFeed: (items: unknown, options: CapturedOptions) => {
    feedCalls.push({ items, options });
    return { upsert: () => {} };
  },
}));

import { useToolCallFeed } from "../../../src/composables/useToolCallFeed";
import { readToolCall } from "../../../src/components/toolCall";

const call = (toolUseId?: string): ToolCall => ({ toolName: "Read", status: "completed", at: 1, ...(toolUseId === undefined ? {} : { toolUseId }) });
const onlyCall = (): CapturedOptions => {
  expect(feedCalls).toHaveLength(1);
  return feedCalls[0].options;
};

// The tools pane and a blueprint step's live activity read ONE feed; these are its terms.
describe("useToolCallFeed", () => {
  beforeEach(() => {
    feedCalls.length = 0;
  });

  it("feeds the given list from the session it is asked for, read live", () => {
    const calls = ref<ToolCall[]>([]);
    let session: string | null = "a";
    useToolCallFeed(calls, () => session);
    const options = onlyCall();
    expect(feedCalls[0].items).toBe(calls);
    expect(options.sessionId()).toBe("a");
    session = null;
    expect(options.sessionId()).toBeNull();
    expect(Object.keys(options).sort()).toEqual(["channel", "historyKey", "historyUrl", "identify", "parse", "sessionId"]);
    expect(options.historyKey).toBe("toolCalls");
    expect(options.parse).toBe(readToolCall);
  });

  it("encodes the session into the history URL and names its channel", () => {
    useToolCallFeed(ref([]), () => "x");
    const options = onlyCall();
    ["abc", "a/b c", "%", "", "日本"].forEach((id) => {
      expect(options.historyUrl(id)).toBe(`/api/tool-calls/${encodeURIComponent(id)}`);
      expect(options.channel(id)).toBe(`toolcalls:${id}`);
    });
  });

  it("identifies a call by its tool_use_id, so a PostToolUse completes the PreToolUse's entry", () => {
    useToolCallFeed(ref([]), () => "x");
    const options = onlyCall();
    expect(options.identify(call("tu-1"))).toBe("tu-1");
    expect(options.identify(call())).toBeUndefined();
  });

  it("passes the session-change hook through when one is given", () => {
    const onSessionChange = vi.fn();
    useToolCallFeed(ref([]), () => "x", onSessionChange);
    expect(onlyCall().onSessionChange).toBe(onSessionChange);
  });
});
