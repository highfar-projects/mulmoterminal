// Whose credential a claude spawn carries, once token rotation is in play (#2919).
//
// Rotation only ever touches a session that would otherwise run on the `/login` credential in the
// default home. A provider session already names its backend and token, a custom agent runs the
// user's own command line, and an account session runs on its own home's login — each of those
// says whose subscription it is, and rotating it would silently overrule that.
import type { ProviderResolution } from "../spawn/setup/provider-env.js";
import type { TokenAssignment } from "../../agents/token/token-assignment.js";

export interface RotationEligibility {
  /** The provider resolution's env: non-empty for a provider session. */
  providerEnv: Readonly<Record<string, string>>;
  /** Whether this spawn runs a configured custom agent. */
  runsCustomAgent: boolean;
  /** Whether this session is bound to an account's home. */
  onAccount: boolean;
}

export const rotationApplies = ({ providerEnv, runsCustomAgent, onAccount }: RotationEligibility): boolean =>
  Object.keys(providerEnv).length === 0 && !runsCustomAgent && !onAccount;

export interface SessionCredential {
  /** The settings file's env block — a token travels here, never on argv. */
  env: Record<string, string>;
  unset: readonly string[];
  /** The token the new process runs on, or null when rotation did not choose one. */
  tokenId: string | null;
}

/** The provider resolution with the assigned token laid over it, when rotation applies. */
export function sessionCredential(resolved: ProviderResolution, eligibility: RotationEligibility, assign: () => TokenAssignment | null): SessionCredential {
  const assignment = rotationApplies(eligibility) ? assign() : null;
  if (!assignment) return { env: resolved.env, unset: resolved.unset, tokenId: null };
  return { env: { ...resolved.env, ...assignment.env }, unset: [...new Set([...resolved.unset, ...assignment.unset])], tokenId: assignment.tokenId };
}
