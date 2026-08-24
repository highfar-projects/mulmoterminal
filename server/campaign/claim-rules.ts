// What a claim registry DECIDES, with no disk under it: whether two claims collide, whether one is
// still live, and whether a holder is still allowed to act.
//
// Kept apart from the storage that will enforce it (#1815) because these are the parts a reader can
// check by reading. The filesystem side — the compare-and-set that makes acquisition atomic — is a
// different kind of problem and gets its own review.
//
// Every path here is expected to be CANONICAL already: `server/infra/canonical-path.ts` resolves
// symlinks and, on a case-insensitive filesystem, returns the one spelling the disk actually has.
// Normalising is not repeated here, because a second normaliser is a second answer, and two
// answers about "is this the same path" is exactly what exclusion cannot survive.
import path from "node:path";
import { byCodeUnit } from "../../common/byCodeUnit.js";

/** Who holds a claim, and which generation of it. A holder presents both to act. */
export interface ClaimToken {
  /** The task that took it. */
  owner: string;
  /**
   * Bumped every time the claim changes hands. The whole point of the number: a holder whose lease
   * expired and was taken over still believes it holds the claim, and its next write must be
   * refused. The generation is what tells it from the current holder — whoever that now is, and
   * whether or not it is the same task taking its own claim back.
   */
  generation: number;
}

export interface Claim {
  /** Canonical paths this claim covers. */
  paths: readonly string[];
  token: ClaimToken;
  /** Epoch ms after which the claim is no longer live and may be taken over. */
  expiresAt: number;
}

/**
 * A path without the trailing separators, so the two spellings of one directory compare equal.
 *
 * A root trims to the empty string, which is deliberate rather than an oversight: the caller
 * appends a separator before comparing, so `/` and `""` answer identically for every path. A floor
 * at the root would be a branch no input can reach.
 *
 * Not a regex: `[/\\]+$` is the anchored-quantifier shape that backtracks super-linearly, and a
 * path is a value from outside. The recursion is bounded by the number of trailing separators.
 */
function withoutTrailingSeparator(p: string): string {
  const isSeparator = p.endsWith("/") || p.endsWith(path.sep);
  return isSeparator ? withoutTrailingSeparator(p.slice(0, -1)) : p;
}

/**
 * Does one path cover the other?
 *
 * Segment-aware on purpose: `src/foo` and `src/foobar` are different files, and a prefix test on
 * raw strings says otherwise. That mistake would let two tasks edit neighbouring paths believing
 * they were excluded from each other — or refuse a task for a collision that is not one.
 *
 * Both sides are trimmed of trailing separators first, so the two spellings of one directory get
 * one answer whichever way round the question is asked. `pathsConflict` would survive without that
 * — it asks both ways — but this is exported, and a caller using it directly would not.
 */
export function covers(outer: string, inner: string): boolean {
  const from = withoutTrailingSeparator(outer);
  const to = withoutTrailingSeparator(inner);
  if (from === to) return true;
  const withSeparator = from.endsWith(path.sep) ? from : from + path.sep;
  return to.startsWith(withSeparator);
}

/** Do these two paths conflict? Either covering the other is a conflict, in both directions. */
export const pathsConflict = (a: string, b: string): boolean => covers(a, b) || covers(b, a);

/** The paths in `wanted` that some path in `held` conflicts with. Empty means the set is free. */
export function conflictingPaths(held: readonly string[], wanted: readonly string[]): string[] {
  return wanted.filter((want) => held.some((have) => pathsConflict(have, want)));
}

/** Is this claim still in force at `now`? Expiry is exclusive: at exactly `expiresAt` it is over. */
export const isLive = (claim: Claim, now: number): boolean => now < claim.expiresAt;

/**
 * The claims that stand in the way of `wanted` at `now`.
 *
 * An expired claim is NOT in the way — that is what expiry is for — but it is also not gone: the
 * caller has to take it over through the registry so the generation moves, rather than quietly
 * writing over a holder that may still be running.
 */
export function blockingClaims(claims: readonly Claim[], wanted: readonly string[], now: number): Claim[] {
  return claims.filter((claim) => isLive(claim, now) && conflictingPaths(claim.paths, wanted).length > 0);
}

/**
 * The order paths must be acquired in.
 *
 * Sorted, and that is a deadlock argument rather than tidiness: two tasks wanting overlapping sets
 * will always meet on the same path first, so one of them loses there instead of each holding half
 * of what the other needs.
 *
 * By CODE UNIT, which is the reason `byCodeUnit` exists: the order has to be the same in every
 * process for the argument above to hold, and `localeCompare` makes it depend on who is running
 * the app. Two runners under different locales could then acquire an overlapping pair in opposite
 * orders — the deadlock this ordering is here to prevent.
 */
export const acquisitionOrder = (paths: readonly string[]): string[] => [...new Set(paths)].sort(byCodeUnit);

/** Why a holder's action was refused. */
export type FencingVerdict = "ok" | "not-the-owner" | "superseded" | "expired";

/**
 * May this holder still act on the claim?
 *
 * The three refusals are different facts and are kept apart, because a runner does different things
 * with them: `not-the-owner` is a bug in the caller, `superseded` means somebody took the claim
 * over and this task must stop, and `expired` means nobody holds it — the task has to reacquire
 * before it may touch anything.
 *
 * **The generation is asked first, and that ordering is the distinction.** A holder from an earlier
 * generation is superseded whoever holds it now — asking about the owner first would answer
 * `not-the-owner` when the claim changed hands to somebody else, and `superseded` when the same
 * task took it back, which is one situation reported two ways. A stale holder is not a caller bug.
 *
 * A generation ABOVE the current one was never issued by any registry, so it is a caller bug like
 * any other invented token, not a holder that is merely late.
 */
export function fencingVerdict(claim: Claim, presented: ClaimToken, now: number): FencingVerdict {
  if (presented.generation < claim.token.generation) return "superseded";
  if (presented.owner !== claim.token.owner || presented.generation !== claim.token.generation) return "not-the-owner";
  return isLive(claim, now) ? "ok" : "expired";
}

/**
 * The token a takeover writes.
 *
 * Always a higher generation, never a reset: the previous holder may still be running, and the
 * number is the only thing that will tell its next write apart from the new holder's.
 */
export const nextToken = (previous: ClaimToken, owner: string): ClaimToken => ({ owner, generation: previous.generation + 1 });

/**
 * A renewal keeps the same token and moves the deadline — it is not a change of hands.
 *
 * **Null once the term has run out**, and that is the point of having a term at all. Renewing an
 * expired claim in place would leave the generation where it was, so a holder that fencing had
 * already turned away as `expired` would come back as `ok` — while the paths may meanwhile have
 * been taken over by somebody whose only distinguishing mark is a higher generation.
 *
 * There is no renewing your way out of that. A lapsed claim is reacquired, through `nextToken`.
 */
export const renewed = (claim: Claim, now: number, termMs: number): Claim | null => (isLive(claim, now) ? { ...claim, expiresAt: now + termMs } : null);
