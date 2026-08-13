import { ref } from "vue";
import type { AskQuestionDone, AskQuestionEvent } from "../../common/askQuestion";

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
 * So closes are COUNTED per session, and a hydration is only accepted if the count has not moved
 * since it started. That is fail-closed on purpose: discarding a still-valid answer costs the pane
 * one open — the next enlarge asks again — while accepting a stale one drives a live terminal.
 */
export function createQuestionBox(fetchOpen: (sessionId: string) => Promise<AskQuestionEvent | null>) {
  // Replaced rather than mutated on every write: a `ref` over a Map does not track its own writes.
  const questions = ref(new Map<string, AskQuestionEvent>());
  const closes = new Map<string, number>();

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
    closes.set(event.sessionId, (closes.get(event.sessionId) ?? 0) + 1);
    if (get(event.sessionId)?.toolUseId !== event.toolUseId) return false;
    write(event.sessionId, null);
    return true;
  };

  /** Forget a session's dialog without waiting for its close — the pane has just answered it. */
  const drop = (sessionId: string): void => write(sessionId, null);

  const hydrate = async (sessionId: string): Promise<void> => {
    if (has(sessionId)) return;
    const generation = closes.get(sessionId) ?? 0;
    const open = await fetchOpen(sessionId);
    const closedSince = (closes.get(sessionId) ?? 0) !== generation;
    if (open && !has(sessionId) && !closedSince) write(sessionId, open);
  };

  return { questions, has, get, offer, close, drop, hydrate };
}
