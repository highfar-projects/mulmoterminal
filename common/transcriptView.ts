// What a hosted agent's conversation looks like ON THE WIRE.
//
// In `common/` because both ends decide from it: the host folds an agent's JSONL (or copilot's
// table) into these shapes in `server/session/transcript-view.ts`, and two clients render them —
// the phone's terminal detail page over the remoteHost socket, and the browser's transcript pane
// over `/api/transcript/view`. Mirroring the shape into `src/` would let one side gain a status the
// other silently renders as nothing.
//
// The RULES that produce these — the turn boundary, the line budget, the tool-result cap — stay on
// the server. This file is the vocabulary, not the folding.

export type TranscriptRowKind = "user" | "assistant" | "tool" | "unknown";

/** One content block, rendered.
 *
 *  `text` may itself contain newlines — an assistant answer is passed through whole, because the
 *  wrapping belongs to the client's CSS and not to a host that cannot know its width.
 *
 *  `clipped` says THIS row's text was cut, which is a different fact from `TranscriptView.truncated`
 *  (a whole turn was dropped). Naming them the same word would leave the client unable to decide
 *  which mark to draw. */
export interface TranscriptRow {
  kind: TranscriptRowKind;
  text: string;
  clipped?: boolean;
}

/** One exchange: a user prompt and everything that followed it.
 *
 *  `at` is the BOUNDARY record's own timestamp — the moment the turn started — or null when it is
 *  not a string. Null rather than dropping the turn: a turn is worth more than its clock. */
export interface TranscriptTurn {
  at: string | null;
  rows: TranscriptRow[];
}

/** What the host answers. A discriminated union rather than "readable: boolean": "no transcript
 *  yet", "the conversation was ended with /clear" and "too big to find a turn in" are three
 *  different things to tell a person, and one boolean collapses them into the same blank view. */
export type TranscriptView =
  | { status: "ok"; turns: TranscriptTurn[]; truncated: boolean }
  | { status: "none" }
  | { status: "cleared" }
  | { status: "too-large" }
  /** This session's agent keeps a conversation somewhere, and no reader here can read it yet
   *  (#1822). A DIFFERENT fact from `none`, which means "this session has written nothing we can
   *  find" — the phone falls back to the screen for both, but only one of them is worth a sentence
   *  to a person, and only one of them is a thing to go and implement.
   *
   *  Never answered for a shell or a launcher cell: those have no conversation and never will, so
   *  the screen IS their content rather than a fallback from something missing. */
  | { status: "not-supported" };

/** One page of a conversation, read backwards from `older` (#2112).
 *
 *  The cursor is OPAQUE to the client on purpose: it is a byte offset for the three agents that
 *  keep a file and a `turn_index` for the one that keeps a table, and a client that knew which
 *  would be deciding something only the host can know. It is handed back verbatim to ask for the
 *  page before this one.
 *
 *  `older: null` means this page reaches the start of what can be read — either the head of the
 *  transcript, or the point past which the host refuses to read (`status: "too-large"`).
 *
 *  The view is carried whole rather than flattened in beside the cursor: every non-`ok` status is
 *  a sentence the client already knows how to show, and re-deciding them per page is how the two
 *  ends drift. */
export interface TranscriptPage {
  view: TranscriptView;
  older: string | null;
}
