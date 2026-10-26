// When the board's reply box may type into a cell (#3185), pure. Stated as what is PERMITTED: a
// reply goes only when the cell is known to have no question dialog open and nothing else is writing
// to it. Every other state — a lookup in flight, a lookup that failed, a dialog seen and not yet
// closed — keeps it shut, because text typed then lands in the dialog. That refuses some replies that
// would have been safe; the alternative is enumerating the unsafe states, which three review rounds
// in a row found one more of.
import type { OpenQuestionLookup } from "../composables/openQuestion";

/** What is known about the cell's question dialog. */
export type DialogState = "none" | "open" | "unknown";

/** After asking the host. A failed lookup said nothing, which is not the same as "none". */
export const dialogAfterLookup = (lookup: OpenQuestionLookup): DialogState => {
  if (!lookup.ok) return "unknown";
  return lookup.question ? "open" : "none";
};

/** With the question pane off the host reports no dialogs, so none is tracked — as on the phone —
 *  except one already seen open, which stays open until the cell stops waiting. */
export const dialogWhenUntracked = (previous: DialogState): DialogState => (previous === "open" ? "open" : "none");

export interface ReplyGateInput {
  dialog: DialogState;
  sending: boolean;
  answering: boolean;
  text: string;
}

export const replyPermitted = ({ dialog, sending, answering, text }: ReplyGateInput): boolean =>
  dialog === "none" && !sending && !answering && text.trim() !== "";
