// The agy hooks this server registers, and their translation into the body the Claude hook route
// already understands — so the working dot, the attention mark, the sound and the push are reached
// without a second copy of any of it (the same arrangement cursor and copilot have).
//
// Measured against agy 1.3.5 in the interactive TUI (#3034): one turn fires `PreInvocation` once per
// model call with `invocationNum` restarting at 0 each turn, and `Stop` exactly once when the turn
// ends. `SessionStart` is not a turn boundary — it fires on the conversation's first turn only.
import { isRecord } from "../../../common/isRecord.js";

/** agy's event name → the Claude name every downstream table is written against. */
const EVENT_NAMES = {
  PreInvocation: "UserPromptSubmit",
  Stop: "Stop",
} as const;

type AntigravityHookEvent = keyof typeof EVENT_NAMES;

export const ANTIGRAVITY_HOOK_EVENTS: readonly AntigravityHookEvent[] = ["PreInvocation", "Stop"];

// agy reads a hook's stdout as its answer. These are the two replies the probe ran with: `Stop`'s
// `decision` other than "continue" lets the turn end, and `{}` asks nothing of `PreInvocation`.
const HOOK_REPLY: Readonly<Record<AntigravityHookEvent, string>> = {
  PreInvocation: "{}",
  Stop: '{"decision":""}',
};

// A CONSTANT per event, with the port and session read from the environment: the file is shared by
// every session in the directory, so nothing per-session may be written into it. Unset outside a
// MulmoTerminal agy cell, which is why the post is skipped rather than sent with an empty header.
// `--noproxy` because curl otherwise sends even a loopback URL to an `http_proxy` the pane inherited.
export const antigravityHookCommand = (event: AntigravityHookEvent): string =>
  '[ -n "$MULMOTERMINAL_SESSION_ID" ] && ' +
  "curl --noproxy 127.0.0.1 -s -m 5 -X POST -H content-type:application/json -H x-mt-agent:antigravity " +
  `-H x-mt-hook:${event} -H x-mt-session:$MULMOTERMINAL_SESSION_ID ` +
  `-d @- http://127.0.0.1:$MULMOTERMINAL_PORT/api/hook >/dev/null 2>&1; echo '${HOOK_REPLY[event]}'`;

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const isHookEvent = (name: string | undefined): name is AntigravityHookEvent => ANTIGRAVITY_HOOK_EVENTS.some((event) => event === name);

/** agy names the session's directories in `workspacePaths`; the first is the one it was started in. */
function cwdOf(payload: Record<string, unknown>): string | undefined {
  const paths = payload.workspacePaths;
  return Array.isArray(paths) ? str(paths[0]) : undefined;
}

/**
 * The Claude-shaped body, or null for a hook that is not a turn boundary.
 *
 * Only the turn's FIRST model call starts it: a `PreInvocation` after a tool call is the middle of
 * the same turn, and reading it as a prompt would re-announce one that was never typed.
 *
 * There is deliberately no `session_id`: agy's `conversationId` is its own and not ours, and the
 * route would fall back to it when the header is missing. The session comes from `x-mt-session`.
 */
export function antigravityHookBody(hookName: string | undefined, payload: unknown): Record<string, unknown> | null {
  if (!isHookEvent(hookName) || !isRecord(payload)) return null;
  if (hookName === "PreInvocation" && payload.invocationNum !== 0) return null;
  return { hook_event_name: EVENT_NAMES[hookName], cwd: cwdOf(payload) };
}
