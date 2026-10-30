// The title a sidebar row shows, in seven-tier precedence: the user's own memo wins, then the name
// they gave with Claude Code's `/rename`, then this process's live AI title, then the on-disk ai-title, then the on-disk last-prompt, then the
// session's first user message, and a sentinel when there is nothing at all.
//
// The memo sits on top for the reason it exists (#1084): every tier below it is what the AGENT
// said, and the memo is the user saying what the session is FOR. The `/rename` name is the user
// too, typed in the agent's own UI, so it outranks every generated title but not the memo, which
// is the one written here. Same rule in the grid cell's
// header (src/components/cellActivity.ts) and in the phone's roster row (server/index.ts) — a
// session must not answer to three different names depending on where it is looked at.
//
// `||` is load-bearing here, and DIFFERENT from the `??` in session-detail-view.ts: every
// tier is a string that must be SKIPPED when empty. A live title of "" is not "the user
// cleared it, show blank" (that is the detail view's contract) — here it means "this
// process has no usable live title, fall through to disk". Tidying `||` into `??` would
// pin an empty string as the row's title and hide the real one sitting on disk right below.

import { sessionDisplayName } from "../../../common/sessionMemo.js";

export interface SessionListTitleInput {
  memo: string | undefined;
  diskCustomTitle: string | null;
  liveAiTitle: string | undefined;
  diskAiTitle: string | null;
  diskLastPrompt: string | null;
  firstUserMsg: string | null;
}

export const UNTITLED_SESSION = "(untitled session)";

export function sessionListTitle(input: SessionListTitleInput): string {
  const { memo, diskCustomTitle, liveAiTitle, diskAiTitle, diskLastPrompt, firstUserMsg } = input;
  return sessionDisplayName(memo, diskCustomTitle, liveAiTitle, diskAiTitle, diskLastPrompt, firstUserMsg) || UNTITLED_SESSION;
}
