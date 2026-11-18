import type { Ref } from "vue";
import { useSessionFeed } from "./useSessionFeed";
import { readToolCall, type ToolCall } from "../components/toolCall";

// One session's tool calls: the stored history, then the live channel. Keying by tool_use_id lets a
// PostToolUse complete the "running" entry its PreToolUse created.
// `host`: the peer server the session runs on (common/peers.ts), null/absent for this one.
export function useToolCallFeed(calls: Ref<ToolCall[]>, sessionId: () => string | null, onSessionChange?: () => void, host?: () => string | null): void {
  useSessionFeed(calls, {
    sessionId,
    ...(host ? { host } : {}),
    historyUrl: (id) => `/api/tool-calls/${encodeURIComponent(id)}`,
    historyKey: "toolCalls",
    channel: (id) => `toolcalls:${id}`,
    identify: (call) => call.toolUseId,
    parse: readToolCall,
    ...(onSessionChange ? { onSessionChange } : {}),
  });
}
