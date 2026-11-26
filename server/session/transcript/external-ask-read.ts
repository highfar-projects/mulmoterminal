// Reading back the answer to an external ask (plans/feat-external-ask.md): the session's last
// completed turn, and — when the user has spoken to the session since — the turns before it, page by
// page through the reader the conversation view uses, until the tagged prompt is found.
//
// Stateless on purpose: the tag is in the transcript, so nothing about the send has to survive in
// this process, and an answer can still be read after MulmoTerminal restarts.
import type { TranscriptPage } from "../../../common/transcriptView.js";
import type { TerminalAgent } from "../../../common/sessionAgent.js";
import { answerFor, promptCarries, type AnswerState } from "../../routes/externalAsk.js";
import { relayTurnOf, type RelayTurn } from "./relay-range.js";
import type { LastTurn } from "./last-turn.js";

/** Pages read per poll at most. Each is a tail window of the log, so this bounds the work. */
export const EXTERNAL_ASK_MAX_PAGES = 4;

export type ExternalReadResult = AnswerState | { status: "cleared" };

export interface ExternalAskReadDeps {
  /** The conversation the session is in now, or null when a /clear left none recorded. */
  transcriptIdOf: (session: string) => string | null;
  cwdOf: (session: string) => Promise<string>;
  lastTurn: (cwd: string, transcriptId: string, agent: TerminalAgent) => Promise<LastTurn>;
  readPage: (cwd: string, session: string, before: string | null, agent: TerminalAgent) => Promise<TranscriptPage>;
}

const pageTurns = (page: TranscriptPage): RelayTurn[] =>
  page.view.status === "ok" ? page.view.turns.map(relayTurnOf).filter((turn): turn is RelayTurn => turn !== null) : [];

export async function readExternalAnswer(deps: ExternalAskReadDeps, session: string, askId: string, agent: TerminalAgent): Promise<ExternalReadResult> {
  const transcriptId = deps.transcriptIdOf(session);
  if (transcriptId === null) return { status: "cleared" };
  const cwd = await deps.cwdOf(session);
  const last = await deps.lastTurn(cwd, transcriptId, agent);
  if (promptCarries(last.prompt, askId)) return answerFor(askId, last, []);
  let turns: RelayTurn[] = [];
  let before: string | null = null;
  for (let pages = 0; pages < EXTERNAL_ASK_MAX_PAGES; pages += 1) {
    const page = await deps.readPage(cwd, session, before, agent);
    turns = [...pageTurns(page), ...turns];
    if (turns.some((turn) => promptCarries(turn.prompt, askId)) || page.older === null) break;
    before = page.older;
  }
  return answerFor(askId, last, turns);
}
