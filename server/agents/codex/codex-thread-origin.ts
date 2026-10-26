// Which codex rollouts are a conversation a person can resume, and which are threads codex ran
// for itself. Both land in the same store, and a thread codex spawned carries its PARENT's cwd, so
// the cwd filter alone lists them and the one real conversation in a directory is lost among
// untitled rows (#1777 subagents, #3198 guardian reviews).
//
// `session_meta` says which a thread is in two fields, and they answer different questions:
//
// - `source` says WHO started it. A frontend is a bare string (`"cli"`, `"exec"`, `"vscode"`) or
//   `{"custom": …}`; a thread codex started for itself is `{"subagent": …}` or `{"internal": …}`.
//   That is codex's own `SessionSource::is_non_root_agent()`, and because the variant is the KEY,
//   a kind of machinery codex adds later lands under one of the two keys and is caught here
//   without a change.
// - `thread_source` says what the thread is FOR. A client can set it on a thread whose `source`
//   is a frontend: the Codex app starts its automations through the app-server with
//   `thread_source: "automation"`. The structural rule cannot see those, so they are named.
//
// Both are deny-rules on purpose. An allow-list of `user` would make each new codex thread kind
// vanish from the listing silently: `thread_source` is absent on rollouts older codex wrote and
// takes values we have not seen (`realtime_voice`), and those are real conversations.
import { isRecord } from "../../../common/isRecord.js";

/** The variant of codex's `SessionSource`: a frontend, or one of the two kinds codex spawns. */
export type SessionSourceKind = "root" | "subagent" | "internal";

export interface ThreadOrigin {
  sourceKind: SessionSourceKind;
  threadSource: string | null;
}

// Every `ThreadSource` codex names other than `user`, plus the one its app attaches by hand.
const MACHINERY_THREAD_SOURCES: ReadonlySet<string> = new Set(["subagent", "guardian_review", "memory_consolidation", "automation"]);

export function sessionSourceKind(source: unknown): SessionSourceKind {
  if (!isRecord(source)) return "root";
  if (Object.hasOwn(source, "subagent")) return "subagent";
  if (Object.hasOwn(source, "internal")) return "internal";
  return "root";
}

/** Is this a thread a person can meaningfully resume? */
export const isResumableThread = ({ sourceKind, threadSource }: ThreadOrigin): boolean =>
  sourceKind === "root" && (threadSource === null || !MACHINERY_THREAD_SOURCES.has(threadSource));
