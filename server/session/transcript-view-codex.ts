// A codex rollout, folded into the same turns the phone already reads for claude (#1822).
//
// The SHAPE of the view is claude's and is not re-decided here: turns opened by a user prompt,
// rows of `user` / `assistant` / `tool` / `unknown`, the line budget, the byte cap, the eviction
// rule. All of that lives in transcript-view.ts and is shared. What is codex's own — and what had
// to be measured rather than assumed — is which record means what.
//
// MEASURED against the 6,901 rollouts on this machine, and one sampled whole
// (rollout-2026-08-23T14-18-25-01a02d0e…, 215 records):
//
//   event_msg/item_completed   74   the per-item stream — a DUPLICATE of the response_items below
//   response_item/function_call 42  a tool call: `name` + `arguments` (a JSON string)
//   response_item/function_call_output 42  its result: `output`, a string
//   event_msg/token_count      19   accounting, no conversation
//   response_item/reasoning    18   `summary: []` and `encrypted_content` — nothing readable
//   response_item/message      16   role: developer 1, user 2, assistant 13
//   session_meta / turn_context / world_state / task_started / task_complete  1 each
//
// THREE TRAPS, each of which produces a plausible-looking wrong view:
//
//   1. A `role: "user"` message is usually NOT the person. In the sampled rollout both of them are
//      codex's own preamble — `<recommended_plugins>` and `<environment_context>`. The boundary
//      rule is therefore `codexUserTurn` (codex-user-turn.ts), which was measured over all 6,334
//      rollouts and already serves three other readers. Writing a fresh "has a user message"
//      predicate here is how every exchange fuses into one turn the budget can never evict.
//   2. ONE prompt can be written TWICE — a `response_item` immediately followed by an `event_msg`
//      with identical text (924 such pairs in the store). `isDoubleWrite` drops the second, or the
//      view shows every prompt twice and opens an empty turn between them.
//   3. `reasoning` carries no text at all (`summary: []`, the body encrypted), so it renders
//      nothing — the same treatment claude's `thinking` gets, and for the same measured reason.
import { isRecord } from "../../common/isRecord.js";
import { codexUserTurn, isDoubleWrite, type CodexUserTurn } from "../agents/codex-user-turn.js";
import { type TranscriptRow, type TranscriptScan, foldTurnRecord, toolResultRow } from "./transcript-view.js";

/** How much of a tool CALL is shown: the tool's name and the head of its arguments. The arguments
 *  are a JSON string of unbounded length — one measured at 4 KB of embedded shell — and the phone
 *  wants to know WHAT ran, not to re-read the whole invocation. */
const CALL_ARGS_MAX_CHARS = 200;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The readable parts of a message's content. Codex writes `input_text` on the way in and
 *  `output_text` on the way out; both carry `.text`, and a part with none is not prose. */
function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => (isRecord(part) ? [text(part.text)] : []))
    .join("")
    .trim();
}

/** One rollout record, rendered. Empty when the record carries nothing a reader wants — which is
 *  most of them: accounting, the item stream, reasoning, and codex's own preamble. */
export function renderCodexRecord(record: Record<string, unknown>): TranscriptRow[] {
  const payload = isRecord(record.payload) ? record.payload : null;
  if (!payload || record.type !== "response_item") return [];
  if (payload.type === "message") {
    // The developer role is the system preamble codex writes for itself, and a `user` message here
    // is either the person's prompt — already rendered by the boundary — or codex's own wrapper.
    if (payload.role !== "assistant") return [];
    const body = messageText(payload.content);
    return body === "" ? [] : [{ kind: "assistant", text: body }];
  }
  if (payload.type === "function_call") {
    const name = text(payload.name) || "(unnamed tool)";
    const args = text(payload.arguments).trim();
    const head = args.length > CALL_ARGS_MAX_CHARS ? `${args.slice(0, CALL_ARGS_MAX_CHARS)}…` : args;
    return [{ kind: "tool", text: head === "" ? name : `${name} ${head}` }];
  }
  if (payload.type === "function_call_output") {
    const out = text(payload.output).trim();
    // `toolResultRow`, not a row of our own: it applies claude's TOOL_RESULT_MAX_LINES and sets
    // `clipped`. A tool result should not be shown at six lines for one agent and whole for another.
    return out === "" ? [] : [toolResultRow(out)];
  }
  // reasoning, and anything a future codex adds. Rendered as nothing rather than as `unknown`:
  // claude's `unknown` row exists to make a CONTENT BLOCK's format change visible, and a rollout's
  // record types are a different axis — codex adds them routinely (world_state, turn_context), and
  // a row per unknown type would fill the view with names of things that are not conversation.
  return [];
}

/** The fold for one scan. A closure rather than a plain function, because trap 2 needs the record
 *  before this one: `isDoubleWrite` is what stops a prompt written in both shapes opening two
 *  turns. */
export function createCodexFold(scan: TranscriptScan): (record: Record<string, unknown>) => void {
  let previousTurn: CodexUserTurn | null = null;
  return (record) => {
    const turn = codexUserTurn(record);
    const duplicate = turn !== null && isDoubleWrite(turn, previousTurn);
    // Tracked for EVERY record's answer, including null: `previous` means "the turn from the record
    // immediately before this one", so a non-turn record between two identical prompts is what
    // tells them apart from a double write.
    previousTurn = turn;
    if (duplicate) return;
    foldTurnRecord(scan, {
      prompt: turn?.text ?? null,
      at: typeof record.timestamp === "string" ? record.timestamp : null,
      rows: renderCodexRecord(record),
    });
  };
}
