// The words on a phone roster row beyond what memory already names (#2210): a title for a live row
// that would otherwise be headed by its UUID, and the latest prompt shown beneath it.
//
// Pure: every read is done by the caller and handed in, so the tier order and the /clear rule are
// testable without a transcript on disk.
import path from "node:path";
import { sessionDisplayName } from "../../../common/sessionMemo.js";
import type { SessionAgent } from "../../../common/sessionAgent.js";

// Both strings ride in a Firestore reply capped at 1 MiB, once per row. A pasted prompt can be
// any size, and the phone shows one truncated line of it anyway.
export const ROW_TITLE_MAX_CHARS = 120;
export const ROW_PROMPT_MAX_CHARS = 200;

const ELLIPSIS = "…";

export interface DiskTitleTiers {
  // The session was `/clear`ed: its transcript is the conversation the user ENDED, so nothing read
  // from it may name the row (#1085).
  cleared: boolean;
  livePrompt: string | undefined;
  diskAiTitle: string | null;
  agentTitle: string | null;
  diskLastPrompt: string | null;
  firstUserMsg: string | null;
}

/** One line, at most `maxChars` code points; "" when nothing printable is left. */
export function oneLine(text: string | null | undefined, maxChars: number): string {
  if (!text) return "";
  const collapsed = text
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const chars = [...collapsed];
  return chars.length <= maxChars ? collapsed : `${chars.slice(0, maxChars - 1).join("")}${ELLIPSIS}`;
}

/** The best name the transcript and the agent's store offer, generated titles before prompts. */
export function diskTitle(tiers: DiskTitleTiers): string {
  const candidates = tiers.cleared ? [tiers.livePrompt] : [tiers.diskAiTitle, tiers.agentTitle, tiers.livePrompt, tiers.diskLastPrompt, tiers.firstUserMsg];
  // Flattened BEFORE the pick, so a whitespace-only tier is skipped rather than chosen as blank.
  return sessionDisplayName(null, ...candidates.map((text) => oneLine(text, ROW_TITLE_MAX_CHARS)));
}

/** Where the session runs, for a row nothing else can name: `mulmoterminal · codex`. */
export function locationTitle(cwd: string, agent: SessionAgent | null): string {
  // basename already ignores a trailing separator, and answers "" for the root.
  const project = cwd ? path.basename(cwd) : "";
  return [project, agent].filter((part) => !!part).join(" · ");
}

// A title capped by `oneLine` is a prefix of the text it came from, ending in the mark.
const repeats = (line: string, title: string): boolean => line === title || (title.endsWith(ELLIPSIS) && line.startsWith(title.slice(0, -ELLIPSIS.length)));

/** The prompt line under a row, or "" when it would say nothing the title does not. */
export function rowPrompt(prompt: string | null | undefined, title: string): string {
  const line = oneLine(prompt, ROW_PROMPT_MAX_CHARS);
  return repeats(line, oneLine(title, ROW_PROMPT_MAX_CHARS)) ? "" : line;
}
