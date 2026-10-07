// Token rotation's two runtime halves (#2919): a usage meter per configured token, and the choice
// of token for a new session's process, made from those meters' readings.
//
// A token is measured in the DEFAULT home under its own credential — exactly how a cell on it runs —
// by the same meter an account uses, keyed by the token rather than the home they all share.
import { createAccountRateLimits } from "./account-rate-limits.js";
import { assignToken, keptAssignment, OAUTH_TOKEN_ENV, ROTATION_UNSET_ENV, type TokenAssignment } from "./token-assignment.js";
import { readRotationToken } from "./token-secret.js";
import { agentHome } from "./agent-homes.js";
import { getTokenRotation } from "../config/config-routes.js";
import type { RotationToken } from "../../common/tokenRotation.js";
import type { RateLimits } from "../../common/rateLimits.js";
import type { ProbeStall } from "./probe-stall.js";
import type { LoginRateLimits } from "./rate-limit-routes.js";

const MS_PER_SEC = 1000;

/** A rotation token as a meter sees it: a claude login like an account's. */
type MeteredToken = RotationToken & { agent: "claude" };
const meteredToken = (token: RotationToken): MeteredToken => ({ ...token, agent: "claude" });

const rotationTokens = (): MeteredToken[] => {
  const rotation = getTokenRotation();
  return rotation.enabled ? rotation.tokens.map(meteredToken) : [];
};

export interface TokenRotationDeps {
  startHomeProbe: (
    home: string,
    probeReportKey: string,
    onSettled: (stall: ProbeStall) => void,
    unset: readonly string[],
    env: Record<string, string>,
    settingsEnv: Record<string, string>,
  ) => () => void;
  claudeAvailable: () => boolean;
  /** The `/login` credential's last windows, from the default gauge's store. */
  defaultLoginLimits: () => RateLimits | null;
}

export interface TokenRotationRuntime {
  meters: LoginRateLimits;
  assignToken: () => TokenAssignment | null;
  keptAssignment: (tokenId: string | undefined) => TokenAssignment | null;
}

export function createTokenRotation(deps: TokenRotationDeps): TokenRotationRuntime {
  // A secret that cannot be read throws, which the meter counts as a probe that never ran.
  const meters = createAccountRateLimits<MeteredToken>({
    accounts: rotationTokens,
    homeOf: () => agentHome("claude"),
    loginOf: (token) => `claude-token:${token.id}`,
    readCodex: () => null,
    startClaudeProbe: (home, probeReportKey, onSettled, token) => {
      const secret = readRotationToken(token);
      if (!secret) throw new Error(`rotation token "${token.id}" could not be read`);
      // In the probe's 0600 settings file, as a cell's token is, never in the child's environment.
      return deps.startHomeProbe(home, probeReportKey, onSettled, ROTATION_UNSET_ENV, {}, { [OAUTH_TOKEN_ENV]: secret });
    },
    claudeAvailable: deps.claudeAvailable,
  });

  const assign = (): TokenAssignment | null =>
    assignToken({
      rotation: getTokenRotation(),
      defaultLoginLimits: deps.defaultLoginLimits,
      tokenLimits: (token) => meters.lastClaudeLimits(meteredToken(token)),
      readSecret: readRotationToken,
      now_sec: Math.floor(Date.now() / MS_PER_SEC),
    });

  return { meters, assignToken: assign, keptAssignment: (tokenId) => keptAssignment(getTokenRotation(), tokenId, readRotationToken) };
}
