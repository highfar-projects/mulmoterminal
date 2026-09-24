// Where a SESSION's agent state lives — the account it was started on, or the agent's default home
// (#2215). Every reader of a claude transcript or a codex rollout for a known session asks here, so
// a cell running on a second login finds its own transcript, cost, title and history.
//
// The configured accounts come in through a provider rather than an import of the config module:
// that module reads the user's config.json when it loads, and this one is imported by readers the
// specs load without a home of their own. Until the provider is set there are no accounts, which
// is exactly the behaviour of a user who configured none.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAccountId, type AccountAgent, type AgentAccount } from "../../common/agentAccounts.js";
import { agentHome, agentHomeEnvVar, agentHomeSpelling } from "../agents/agent-homes.js";
import { accountSessionsHydrated, boundAccount, rememberAccountSession } from "./account-sessions.js";
import { projectSessionsDir } from "./project-dir.js";
import { codexRolloutExists } from "../agents/codex-sessions.js";

let accountsProvider: () => readonly AgentAccount[] = () => [];

/** Called once by the config module, which owns the live list. */
export function setAccountsProvider(provider: () => readonly AgentAccount[]): void {
  accountsProvider = provider;
}

/** An account's home as an absolute path, spelled the way its CLI spells it. */
export function accountHome(account: AgentAccount, homedir: string = os.homedir()): string {
  const expanded = account.home.startsWith("~/") ? path.join(homedir, account.home.slice(2)) : account.home;
  return agentHomeSpelling(account.agent, path.resolve(expanded));
}

/** The configured accounts for one agent. */
export const accountsFor = (agent: AccountAgent): AgentAccount[] => accountsProvider().filter((account) => account.agent === agent);

/** The home this session's state is in: its bound account's, else the agent's default. */
export function sessionHome(agent: AccountAgent, sessionId: string): string {
  return boundAccount(agent, sessionId)?.home ?? agentHome(agent);
}

/** The variable a bound session's spawn carries, and NOTHING for a session on the default home:
 *  setting even the default value would switch Claude Code to a different keychain entry. */
export function accountSpawnEnv(agent: AccountAgent, sessionId: string): Record<string, string> {
  const bound = boundAccount(agent, sessionId);
  return bound ? homeEnv(agent, bound.home) : {};
}

/** The variable that points `agent` at `home` — for a spawn that is not a session, like an account's
 *  usage probe. */
export function homeEnv(agent: AccountAgent, home: string): Record<string, string> {
  const envVar = agentHomeEnvVar(agent);
  return envVar ? { [envVar]: home } : {};
}

/** Where an UNBOUND session's file is: the first home holding it, else the default. Lists show rows
 *  from every home, and a row nobody has opened here yet has no binding — without this it would
 *  open empty. Read-only: a binding is made only when a session STARTS. With no accounts there is
 *  one home and nothing is probed. */
function readHome(agent: AccountAgent, sessionId: string, existsIn: (home: string) => boolean): string {
  const bound = boundAccount(agent, sessionId);
  if (bound) return bound.home;
  const choices = agentHomeChoices(agent);
  if (choices.length === 1) return agentHome(agent);
  return choices.find((choice) => existsIn(choice.home))?.home ?? agentHome(agent);
}

/** The claude home a session's state is read from: its bound home, or, unbound, the one its
 *  transcript is found in. Everything per-session reads through this — the transcript AND the
 *  home's history.jsonl — so the two cannot disagree about which login a session belongs to. */
export const claudeSessionHome = (cwd: string, sessionId: string): string => readHome("claude", sessionId, claudeTranscriptExistsIn(cwd, sessionId));

/** A claude session's transcript, in the home that session runs on (or, unbound, is found in). */
export const claudeTranscriptFile = (cwd: string, sessionId: string): string =>
  path.join(projectSessionsDir(cwd, claudeSessionHome(cwd, sessionId)), `${sessionId}.jsonl`);

/** Where codex keeps rollouts under one home. */
export const codexSessionsUnder = (home: string): string => path.join(home, "sessions");

/** The codex skills directory of the home a session runs on — where its skill mirror belongs. */
export const codexSessionSkillsDir = (sessionKey: string): string => path.join(sessionHome("codex", sessionKey), "skills");

/** Where a codex session's rollouts are, in the home that session runs on. */
export const codexSessionRoot = (sessionKey: string): string =>
  codexSessionsUnder(readHome("codex", sessionKey, (home) => codexRolloutExists(codexSessionsUnder(home), sessionKey)));

/** Whether a claude transcript for this id exists under `home` — the probe bindSessionAccount
 *  takes to find which home an existing session was written to. */
export const claudeTranscriptExistsIn =
  (cwd: string, sessionId: string) =>
  (home: string): boolean =>
    existsSync(path.join(projectSessionsDir(cwd, home), `${sessionId}.jsonl`));

/** The same probe for a codex rollout. */
export const codexRolloutExistsIn =
  (rolloutId: string) =>
  (home: string): boolean =>
    codexRolloutExists(codexSessionsUnder(home), rolloutId);

export interface AgentHomeChoice {
  /** null for the default home. */
  accountId: string | null;
  home: string;
}

/** Every home one agent's state may be in: the default first, then each configured account. An
 *  account that points at the default home is left out — its rows ARE the default's. */
export function agentHomeChoices(agent: AccountAgent): AgentHomeChoice[] {
  const defaultHome = agentHome(agent);
  const choices: AgentHomeChoice[] = [{ accountId: null, home: defaultHome }];
  accountsFor(agent).forEach((account) => {
    const home = accountHome(account);
    if (!choices.some((choice) => choice.home === home)) choices.push({ accountId: account.id, home });
  });
  return choices;
}

/** A directory's claude transcript folder in every home — for the per-directory aggregates
 *  (cost rollup, decisions, occupancy). One entry when no account is configured. */
export const claudeProjectDirs = (cwd: string): { dir: string; accountId: string | null }[] =>
  agentHomeChoices("claude").map(({ accountId, home }) => ({ dir: projectSessionsDir(cwd, home), accountId }));

/** Every codex rollouts root. */
export const codexSessionRoots = (): string[] => agentHomeChoices("codex").map(({ home }) => codexSessionsUnder(home));

/** Whether any codex home holds this rollout. */
export const codexRolloutExistsAnywhere = (rolloutId: string): boolean => codexSessionRoots().some((root) => codexRolloutExists(root, rolloutId));

/** The account a NEW session asked for, looked up by id rather than through agentHomeChoices, which
 *  keeps one id per home and would lose a second account sharing it. An account whose home IS the
 *  default resolves to the default: running it would change nothing on disk but the login. */
function requestedChoice(agent: AccountAgent, requestedAccountId: string | undefined): AgentHomeChoice | null {
  const account = requestedAccountId ? accountsFor(agent).find((candidate) => candidate.id === requestedAccountId) : undefined;
  if (!account) return null;
  const home = accountHome(account);
  return home === agentHome(agent) ? null : { accountId: account.id, home };
}

/**
 * Decide which home a session that is about to START runs on, and remember it.
 *
 * A session is bound once and never moves, because its transcript cannot. So: a session already
 * bound keeps its account; a session whose transcript already exists somewhere runs where that
 * transcript is (a resume ignores the picker, as custom agents do); only a session with no
 * transcript anywhere takes the requested account. An unknown or foreign account id is ignored.
 *
 * Returns the account to run on, or null for the default home — in which case NO variable may be
 * set on the spawn (see common/agentAccounts.ts).
 */
export async function bindSessionAccount(
  agent: AccountAgent,
  sessionId: string,
  requestedAccountId: string | undefined,
  transcriptExistsIn: (home: string) => boolean,
): Promise<AgentHomeChoice | null> {
  await accountSessionsHydrated;
  const bound = boundAccount(agent, sessionId);
  if (bound) return { accountId: bound.accountId, home: bound.home };
  const existing = agentHomeChoices(agent).find((choice) => transcriptExistsIn(choice.home));
  const chosen = existing ?? requestedChoice(agent, requestedAccountId);
  if (!chosen || chosen.accountId === null) return null;
  rememberAccountSession({ sessionId, agent, accountId: chosen.accountId, home: chosen.home });
  return chosen;
}

/**
 * Resolve a connection's session id with its account bound on either side of the decision.
 *
 * Before: a REQUESTED session is bound to wherever its transcript already is, never to the picked
 * account — the resolve step asks whether that transcript exists, and on a second login it is in
 * that login's home. After: only a session the resolve step MINTED takes the picked account; a
 * reconnecting cell re-sends whatever it still holds, and that must not move a conversation.
 */
export async function resolveWithAccount<T extends { sessionId: string }>(
  agent: AccountAgent,
  requested: string | null,
  requestedAccountId: string | undefined,
  transcriptExistsIn: (sessionId: string) => (home: string) => boolean,
  resolve: () => T,
): Promise<T> {
  if (requested) await bindSessionAccount(agent, requested, undefined, transcriptExistsIn(requested));
  const resolution = resolve();
  if (resolution.sessionId !== requested) await bindSessionAccount(agent, resolution.sessionId, requestedAccountId, () => false);
  return resolution;
}

// ?account=<id> — the launch form picked a second login for a NEW session. Only the id travels; it
// is bound against the configured list, and a resume never reads it (resolveWithAccount).
const accountIdParam = (params: URLSearchParams): string | undefined => {
  const value = params.get("account");
  return isAccountId(value) ? value : undefined;
};

/** resolveWithAccount for a claude connection. */
export const resolveClaudeWithAccount = <T extends { sessionId: string }>(
  requested: string | null,
  params: URLSearchParams,
  cwd: string,
  resolve: () => T,
): Promise<T> => resolveWithAccount("claude", requested, accountIdParam(params), (id) => claudeTranscriptExistsIn(cwd, id), resolve);

/** resolveWithAccount for a codex connection. `rolloutOf` maps a session key to the rollout it
 *  runs (the key itself when it came from a list), which is what exists on disk. */
export const resolveCodexWithAccount = <T extends { sessionId: string }>(
  requested: string | null,
  params: URLSearchParams,
  rolloutOf: (sessionKey: string) => string,
  resolve: () => T,
): Promise<T> => resolveWithAccount("codex", requested, accountIdParam(params), (id) => codexRolloutExistsIn(rolloutOf(id)), resolve);
