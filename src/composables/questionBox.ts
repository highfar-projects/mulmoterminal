import { ref } from "vue";
import type { AskQuestionDone, AskQuestionEvent } from "../../common/askQuestion";

// Closed dialogs remembered per session, and bounded: an ask only ever races the closes near it in
// time, so the last few are enough and a long session cannot grow this without limit.
const CLOSED_MEMORY = 50;

/**
 * Which AskUserQuestion dialog each session is blocked on (#1679), and — the part that needs a
 * home of its own — which ones have since CLOSED.
 *
 * Two sources feed this and they can disagree about time: the live pub/sub channel, and an HTTP
 * ask for the dialog a session is on right now (used after a reload or a reconnect, when the
 * channel replayed nothing). A close that lands while an ask is in flight finds an empty box and
 * has nothing to drop; the ask then resolves with the dialog that has just closed. Inserting it
 * would leave buttons over a terminal that has moved on, where an arrow walks the input history
 * and Enter submits what it found.
 *
 * So every close is REMEMBERED by its own `toolUseId`, and a fetched dialog is refused when that
 * same id has closed. Counting closes per session instead was too coarse: a close of question A
 * would discard a hydration that had legitimately fetched the question B opened right after it,
 * and nothing retries — B stays unanswerable in the pane until the cell is re-expanded.
 */
export function createQuestionBox(fetchOpen: (sessionId: string) => Promise<AskQuestionEvent | null>) {
  // Replaced rather than mutated on every write: a `ref` over a Map does not track its own writes.
  const questions = ref(new Map<string, AskQuestionEvent>());
  const closed = new Map<string, string[]>();

  const has = (sessionId: string): boolean => questions.value.has(sessionId);
  const get = (sessionId: string): AskQuestionEvent | null => questions.value.get(sessionId) ?? null;

  const write = (sessionId: string, event: AskQuestionEvent | null): void => {
    const next = new Map(questions.value);
    if (event) next.set(sessionId, event);
    else next.delete(sessionId);
    questions.value = next;
  };

  const offer = (event: AskQuestionEvent): void => write(event.sessionId, event);

  /** Answers whether this close dropped a dialog the box was holding. */
  const close = (event: AskQuestionDone): boolean => {
    closed.set(event.sessionId, [...(closed.get(event.sessionId) ?? []), event.toolUseId].slice(-CLOSED_MEMORY));
    if (get(event.sessionId)?.toolUseId !== event.toolUseId) return false;
    write(event.sessionId, null);
    return true;
  };

  /** Forget a session's dialog without waiting for its close — the pane has just answered it. */
  const drop = (sessionId: string): void => write(sessionId, null);

  /** Has this exact dialog closed? The question a hydration must answer before trusting its find. */
  const isClosed = (sessionId: string, toolUseId: string): boolean => (closed.get(sessionId) ?? []).includes(toolUseId);

  const hydrate = async (sessionId: string): Promise<void> => {
    if (has(sessionId)) return;
    const open = await fetchOpen(sessionId);
    if (open && !has(sessionId) && !isClosed(sessionId, open.toolUseId)) write(sessionId, open);
  };

  return { questions, has, get, offer, close, drop, hydrate, isClosed };
}
