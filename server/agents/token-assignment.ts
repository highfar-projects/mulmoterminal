// Assigning a credential to a new session's process (#2919): the config's candidates, ranked by
// token-choice.ts, and the chosen token's secret turned into the variables the spawn carries.
//
// Pure: the config, the readings, the secret reader and the clock are injected.
import type { RateLimits } from "../../common/rateLimits.js";
import { DEFAULT_LOGIN_ID, type RotationToken, type TokenRotation } from "../../common/tokenRotation.js";
import { chooseToken, type TokenCandidate } from "./token-choice.js";

/** Anything that would outrank the chosen credential (an API key, a provider's token) or stand in
 *  for it (an inherited token) is removed from the session's environment. */
export const ROTATION_UNSET_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"] as const;
export const OAUTH_TOKEN_ENV = "CLAUDE_CODE_OAUTH_TOKEN";

export interface TokenAssignment {
  /** A token id, or DEFAULT_LOGIN_ID. */
  tokenId: string;
  /** Goes in the settings file's env block — which is a 0600 file, never argv. Empty for the
   *  `/login` credential, which Claude Code reads from its own store. */
  env: Record<string, string>;
  unset: readonly string[];
}

export interface TokenAssignmentDeps {
  rotation: TokenRotation;
  defaultLoginLimits: () => RateLimits | null;
  tokenLimits: (token: RotationToken) => RateLimits | null;
  /** Spent marks from limit hits, by token id (DEFAULT_LOGIN_ID included). */
  spentUntil_sec?: (tokenId: string) => number | null;
  readSecret: (token: RotationToken) => string | null;
  now_sec: number;
}

const candidatesOf = (deps: TokenAssignmentDeps): TokenCandidate[] => {
  const spent = (id: string) => deps.spentUntil_sec?.(id) ?? null;
  const tokens = deps.rotation.tokens.map((token) => ({ id: token.id, limits: deps.tokenLimits(token), spentUntil_sec: spent(token.id) }));
  if (!deps.rotation.includeDefaultLogin) return tokens;
  return [{ id: DEFAULT_LOGIN_ID, limits: deps.defaultLoginLimits(), spentUntil_sec: spent(DEFAULT_LOGIN_ID) }, ...tokens];
};

const assignmentOf = (tokenId: string, secret: string | null): TokenAssignment | null => {
  if (tokenId === DEFAULT_LOGIN_ID) return { tokenId, env: {}, unset: ROTATION_UNSET_ENV };
  return secret ? { tokenId, env: { [OAUTH_TOKEN_ENV]: secret }, unset: ROTATION_UNSET_ENV } : null;
};

/**
 * The credential a process ALREADY runs on, for a reattach: its settings file is rewritten on every
 * connection, and must keep saying what the running process was started with rather than whatever
 * would be chosen now. Null when it was not started by rotation, or its token is gone or unreadable.
 */
export function keptAssignment(
  rotation: TokenRotation,
  tokenId: string | undefined,
  readSecret: (token: RotationToken) => string | null,
): TokenAssignment | null {
  if (tokenId === undefined) return null;
  if (tokenId === DEFAULT_LOGIN_ID) return assignmentOf(tokenId, null);
  const token = rotation.tokens.find((candidate) => candidate.id === tokenId);
  return token ? assignmentOf(tokenId, readSecret(token)) : null;
}

/**
 * The credential a new process should run on, or null when rotation has nothing to say — it is
 * off, or no candidate could be used. A token whose secret cannot be read is dropped and the
 * choice made again, so one missing keychain item does not stop every spawn.
 */
export function assignToken(deps: TokenAssignmentDeps): TokenAssignment | null {
  if (!deps.rotation.enabled) return null;
  const pickFrom = (candidates: TokenCandidate[]): TokenAssignment | null => {
    const id = chooseToken(candidates, deps.now_sec);
    if (id === null) return null;
    const token = deps.rotation.tokens.find((candidate) => candidate.id === id);
    const assignment = assignmentOf(id, token ? deps.readSecret(token) : null);
    return assignment ?? pickFrom(candidates.filter((candidate) => candidate.id !== id));
  };
  return pickFrom(candidatesOf(deps));
}
