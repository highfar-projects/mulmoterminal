// Translating a GitHub Copilot CLI hook payload into the body the Claude hook route already
// understands, so everything downstream of /api/hook — the working/waiting dots, the attention
// sound, Web Push, the tool-call history, the work phase, the header prompt — is reached without a
// second copy of any of it.
//
// Everything here is pure. The route's own fan-out does the work; this only renames.
//
// WHY A TRANSLATION AND NOT A SECOND ROUTE: the effect tables downstream key on CLAUDE's event
// names (server/session/activity-hook.ts, tool-hook.ts). codex reaches them the same way, through
// HOOK_EVENT_FOR in codex-activity.ts. A third vocabulary would mean a third copy of the rules for
// what a turn boundary does.
//
// THE EVENT NAME COMES FROM THE HEADER, NOT THE BODY. Measured against copilot 1.0.83: the payload
// carries `hookName` for some events (`permissionRequest`) and not for others (`agentStop`). The
// hook file registers one command per event and puts the name it registered under in a header, so
// the name is always known.
//
// THE SESSION ID COMES FROM THE BODY, which is the opposite of claude's arrangement and only works
// because of copilot-args.ts: `--session-id` makes copilot's own id OURS, so the `sessionId` every
// payload carries is the key this server already has. (claude gets a per-spawn settings file that
// can carry an `x-mt-session` header; copilot's hooks are machine-global — see copilot-hooks-file.ts
// — so there is nothing per-session to bake in, and nothing needs to be.)
import { isRecord } from "../../common/isRecord.js";

/** Copilot's event names, mapped to the Claude names every downstream table is written against.
 *
 *  `permissionRequest` is deliberately ABSENT. It fires before copilot's permission service runs —
 *  measured firing 8 ms before `postToolUse` on a turn with `--allow-all-tools`, where nothing was
 *  ever asked — so it is not the "blocked on input" signal its name suggests and must not be mapped
 *  to `Notification`. Reporting it as one would flag every tool call as needing the user. Inferring
 *  a real block from it (a `permissionRequest` whose `postToolUse` never arrives) is a separate
 *  design, and it belongs in its own change. */
const EVENT_NAMES: Readonly<Record<string, string>> = {
  sessionStart: "SessionStart",
  userPromptSubmitted: "UserPromptSubmit",
  preToolUse: "PreToolUse",
  postToolUse: "PostToolUse",
  postToolUseFailure: "PostToolUseFailure",
  // Documented as CLI-only and not yet observed firing; mapped so that the day it does, it lands
  // where claude's own Notification lands rather than being dropped as unknown.
  notification: "Notification",
  agentStop: "Stop",
};

/** The copilot events the hook file registers. Derived from the map so the file and the translation
 *  cannot drift: an event registered but not translated would post bodies nothing reads. */
export const COPILOT_HOOK_EVENTS: readonly string[] = Object.keys(EVENT_NAMES);

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * The Claude-shaped body, or null when this is not a payload we can act on.
 *
 * Null rather than a partial body for two distinct reasons, and both are real: an event name we do
 * not translate (a copilot release adding one) has no effect table to reach, and a payload with no
 * `sessionId` cannot be attributed to a session at all. Either is silence, not an error — the hook
 * file is machine-global, so this endpoint also hears from copilot sessions this server never
 * started, and shouting about those would be shouting about the user's own terminal.
 */
export function copilotHookBody(hookName: string | undefined, payload: unknown): Record<string, unknown> | null {
  const event = hookName ? EVENT_NAMES[hookName] : undefined;
  if (!event || !isRecord(payload)) return null;
  const sessionId = str(payload.sessionId);
  if (!sessionId) return null;
  return {
    hook_event_name: event,
    session_id: sessionId,
    cwd: str(payload.cwd),
    // `prompt` is what the header line is read from, and copilot spells it the same way claude does.
    prompt: str(payload.prompt),
    // The tool half. copilot's `toolArgs` is claude's `tool_input`, and its `toolResult` is the
    // `tool_response` spelling tool-hook.ts already accepts.
    tool_name: str(payload.toolName),
    tool_input: payload.toolArgs,
    tool_response: payload.toolResult,
    // A Notification's text, for the push body. Absent on every other event.
    message: str(payload.message),
    notification_type: str(payload.notification_type),
  };
}
