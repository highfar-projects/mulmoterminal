// The session's AI-generated title: when it is due, generating it without letting two
// triggers race, and voiding a result that a /clear made stale. Split from index.ts
// (#548 step 3f) — the rules for WHETHER to (re)generate already live in
// config/header-title.ts; this is the bookkeeping around them.
//
// Four guards do the real work and are easy to lose in a rewrite: an epoch that drops a
// title generated across a /clear, the cleared-transcript mark that stops the NEXT turn
// generating one from that same pre-clear file, an in-flight set so a Stop hook and a roster
// view do not both summarize, and a retry floor so a viewed-but-failing session is not
// re-summarized on every poll.
import path from "node:path";
import { aiTitleFromParsed, conversationTurnsFromParsed, isTrivialPrompt, type ConversationTurn } from "./transcript.js";
import { forEachJsonlRecord } from "../infra/jsonl-file.js";
import {
  emptyTitleWindow,
  foldTitleWindow,
  shouldFreshenViewedTitle,
  shouldRegenerateTitle,
  titleWindowOf,
  TITLE_REGEN_EVERY_TURNS,
  VIEW_TITLE_REGEN_TURNS,
} from "../config/header-title.js";
import { aiTitles, lastTitleAttemptMs, lastTitledUserTurns, titleEpoch, titleInFlight, titlePending, titleTurnCounts } from "./registry.js";
import { clearedTranscripts } from "./cleared-transcripts.js";
import { projectSessionsDir } from "./project-dir.js";

// How long a viewed session that failed to summarize waits before being tried again, so a
// roster poll cannot spawn a summarizer per request.
const VIEW_TITLE_RETRY_MS = 30_000;

export interface TitleDeps {
  /** Push the session's row (with its new title) to subscribers. */
  publishActivity: (id: string) => void;
  /** Injected so the retry floor can be tested without waiting out 30 seconds. */
  now: () => number;
  /** The session's title, from whichever source `header-title.ts` selects: the `ai-title` Claude
   *  Code wrote into its own transcript (the default — no process at all), or a summary of the
   *  turns. Injected because the second one shells out to the claude CLI, which a unit test must
   *  never do. */
  // Turns, not the raw transcript: the file reaches 585 MB here and cannot be held as a string
  // at all (#998). The title only reads the last few turns anyway.
  resolveTitle: (input: { turns: ConversationTurn[]; diskAiTitle: string | null }) => Promise<string | null>;
}

interface TitleInputs {
  /** Already narrowed to what a summary can use — see `foldTitleWindow`. */
  turns: ConversationTurn[];
  /** Counted, never derived from `turns`: that array holds at most the last few, and the roster's
   *  re-title cadence compares this against the transcript's CURRENT count (CodeRabbit on #1772).
   *  Deriving it would pin it at the window size and re-title on every poll forever. */
  userTurns: number;
  /** Whether the transcript held any turn at all — the gate the resolve is skipped on. */
  anyTurn: boolean;
  diskAiTitle: string | null;
  /** False when the file could not be opened at all, which is different from a transcript that
   *  simply has nothing to title. */
  read: boolean;
}

/** One streamed pass over the transcript, yielding everything the title needs: the window of turns
 *  (for the `headless` source), how many user turns there were (for the bookkeeping), and the
 *  `ai-title` Claude Code wrote (for the default source). Nothing here grows with the file: it is
 *  streamed because a transcript reaches 585 MB (#998), and retaining every parsed turn to pick six
 *  of them would have given that back. */
async function readTitleInputs(sessionId: string, cwd: string): Promise<TitleInputs> {
  const window = emptyTitleWindow();
  let userTurns = 0;
  let anyTurn = false;
  let diskAiTitle: string | null = null;
  let read = true;
  await forEachJsonlRecord(path.join(projectSessionsDir(cwd), `${sessionId}.jsonl`), (record) => {
    conversationTurnsFromParsed([record]).forEach((turn) => {
      anyTurn = true;
      if (turn.role === "user") userTurns++;
      foldTitleWindow(window, turn);
    });
    // The LAST one wins, the same rule session-reads.ts folds by.
    diskAiTitle = aiTitleFromParsed([record]) ?? diskAiTitle;
  }).catch(() => (read = false));
  return { turns: titleWindowOf(window), userTurns, anyTurn, diskAiTitle, read };
}

export function createTitleManager(deps: TitleDeps) {
  // Drop all AI-title bookkeeping for a session (on /clear or teardown). Bumping the epoch
  // voids any in-flight generation started before this reset — its (now pre-clear) title
  // must not resurface after the header was cleared.
  function forgetTitle(sessionId: string): void {
    aiTitles.delete(sessionId);
    titleTurnCounts.delete(sessionId);
    titlePending.delete(sessionId);
    titleEpoch.set(sessionId, (titleEpoch.get(sessionId) ?? 0) + 1);
  }

  // Count a user turn and flag the session for a title (re)generation at the next Stop when
  // one is due (no title yet, a trivial/stale-inducing ack, or every N turns).
  function noteTitleTurn(sessionId: string, prompt: string): void {
    const turnsSinceTitle = (titleTurnCounts.get(sessionId) ?? 0) + 1;
    titleTurnCounts.set(sessionId, turnsSinceTitle);
    const due = shouldRegenerateTitle({
      hasTitle: aiTitles.has(sessionId),
      promptIsTrivial: isTrivialPrompt(prompt),
      turnsSinceTitle,
      maxTurns: TITLE_REGEN_EVERY_TURNS,
    });
    if (due) titlePending.add(sessionId);
  }

  // Read the transcript, summarize its recent turns into a title, and store + publish it.
  // Epoch-guarded: a /clear or teardown mid-generation bumps the epoch, so the now-stale
  // result is dropped. In-flight-guarded so overlapping triggers (a Stop hook and a roster
  // view) don't both summarize. Never throws — a failed/timed-out CLI just leaves the prior title.
  async function generateAndStoreTitle(sessionId: string, cwd: string): Promise<void> {
    if (titleInFlight.has(sessionId)) return;
    // A cleared session has no transcript to title from: claude moved to a new one and ours is
    // frozen on the conversation the user just ended, so this is where the pre-clear title kept
    // coming back — forgetTitle makes the next turn think a title is DUE, and the only turns on
    // disk are the ended ones (#1085). No title beats the wrong one; the header falls back to the
    // live prompt.
    if (clearedTranscripts.has(sessionId)) return;
    titleInFlight.add(sessionId);
    const epoch = titleEpoch.get(sessionId) ?? 0;
    try {
      const { turns, userTurns, anyTurn, diskAiTitle, read } = await readTitleInputs(sessionId, cwd);
      const title = read && anyTurn ? await deps.resolveTitle({ turns, diskAiTitle }) : null;
      if (title && (titleEpoch.get(sessionId) ?? 0) === epoch) {
        aiTitles.set(sessionId, title);
        titleTurnCounts.set(sessionId, 0);
        lastTitledUserTurns.set(sessionId, userTurns);
        deps.publishActivity(sessionId);
      }
    } finally {
      titleInFlight.delete(sessionId);
    }
  }

  // At Stop (the assistant's reply is now on disk), regenerate a pending title from the
  // recent turns and publish it. Fire-and-forget; a failure leaves the last prompt showing.
  async function maybeGenerateTitle(sessionId: string, cwd: string | undefined): Promise<void> {
    if (!cwd || !titlePending.has(sessionId) || titleInFlight.has(sessionId)) return;
    titlePending.delete(sessionId);
    await generateAndStoreTitle(sessionId, cwd);
  }

  // The grid roster summarizes on our side even for sessions the hook path never runs on
  // (unmanaged / resumed / post-restart), so it never shows a stale externally-written title.
  // Fire-and-forget from the view; the freshened title lands on the next roster poll.
  function freshenRosterTitle(sessionId: string, cwd: string, currentUserTurns: number): void {
    if (titleInFlight.has(sessionId)) return;
    const stale = shouldFreshenViewedTitle({
      lastTitledUserTurns: lastTitledUserTurns.get(sessionId) ?? null,
      currentUserTurns,
      regenEveryTurns: VIEW_TITLE_REGEN_TURNS,
    });
    if (!stale) return;
    const now = deps.now();
    if (now - (lastTitleAttemptMs.get(sessionId) ?? 0) < VIEW_TITLE_RETRY_MS) return;
    lastTitleAttemptMs.set(sessionId, now);
    void generateAndStoreTitle(sessionId, cwd);
  }
  return { forgetTitle, noteTitleTurn, maybeGenerateTitle, freshenRosterTitle };
}
