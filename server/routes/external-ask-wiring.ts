// The external ask routes wired to this host's real tables (plans/feat-external-ask.md). Its own file
// so app-routes.ts — which upstream changes constantly — carries one import and one call for it.
import type { Express } from "express";
import { randomBytes } from "node:crypto";
import type { AskQuestionEvent } from "../../common/askQuestion.js";
import { sessionDisplayName } from "../../common/sessionMemo.js";
import { activity, aiTitles, knownSessions, lastHookEvent, ptys, sessionMemos } from "../session/registry.js";
import { sendToSession } from "../session/session-input.js";
import { sessionExistsHere } from "../backends/remoteHost/hostBindings.js";
import { agentOfSession } from "../session/list/session-lookup.js";
import { cwdForSessionHydrated } from "../session/session-cwd.js";
import { sessionLastTurn } from "../session/session-reads.js";
import { transcriptIdOf } from "../session/transcript/cleared-transcripts.js";
import { sessionTranscriptPage } from "../session/transcript/transcript-view-read.js";
import { readExternalAnswer } from "../session/transcript/external-ask-read.js";
import { currentBranch } from "../git/git-status.js";
import { claudePeerName } from "../agents/claude/claude-peer-registry.js";
import { mulmoterminalHome } from "../infra/fs/mulmoterminal-home.js";
import { appendExternalAskLog, ensureExternalAskToken, readExternalAskSettings } from "../config/external-ask-files.js";
import { waitingOnPermission } from "./issueSessionWatch.js";
import { mountExternalAskRoutes } from "./external-ask-routes.js";

const ASK_ID_BYTES = 6;

export function mountExternalAsk(app: Express, openQuestion: (session: string) => Promise<AskQuestionEvent | null>): void {
  const home = mulmoterminalHome;
  mountExternalAskRoutes(app, {
    settings: () => readExternalAskSettings(home()),
    token: () => ensureExternalAskToken(home()),
    liveSessions: () => [...ptys.entries()].map(([id, entry]) => ({ id, agent: entry.agent, cwd: entry.cwd })),
    sessionExists: sessionExistsHere,
    agentOf: agentOfSession,
    describe: (id) => {
      const memo = sessionMemos.get(id) ?? null;
      const state = activity.get(id) ?? {};
      return {
        memo,
        title: sessionDisplayName(memo, aiTitles.get(id), knownSessions.get(id)?.title),
        working: state.working ?? false,
        waiting: state.waiting ?? false,
      };
    },
    branchOf: async (cwd) => (await currentBranch(cwd)).branch,
    // As the cell's chip asks it (session-routes.ts): only a claude has a name there.
    peerNameOf: async (id, agent) => (agent === "claude" ? await claudePeerName(id) : null),
    openQuestion,
    permissionPending: (id) => waitingOnPermission(lastHookEvent.get(id)),
    send: (id, text, options) => sendToSession(id, text, options),
    readAnswer: (id, askId, agent) =>
      readExternalAnswer(
        {
          transcriptIdOf,
          cwdOf: cwdForSessionHydrated,
          lastTurn: sessionLastTurn,
          readPage: (cwd, session, before, sessionAgent) => sessionTranscriptPage(cwd, session, before, { agentOf: () => sessionAgent }),
        },
        id,
        askId,
        agent,
      ),
    record: (entry) => appendExternalAskLog(home(), entry),
    nonce: () => randomBytes(ASK_ID_BYTES).toString("hex"),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  });
  // Made at startup when the feature is on, so the caller has a token to read before its first request.
  void readExternalAskSettings(home())
    .then((settings) => (settings.enabled ? ensureExternalAskToken(home()) : null))
    .catch((err: unknown) => console.error(`[external-ask] could not make the token: ${String(err)}`));
}
