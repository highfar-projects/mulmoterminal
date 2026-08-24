// What a claim registry DECIDES, with no disk under it: whether two claims collide, whether one is
// still live, and whether a holder is still allowed to act.
//
// Kept apart from the storage that will enforce it (#1815) because these are the parts a reader can
// check by reading. The filesystem side — the compare-and-set that makes acquisition atomic — is a
// different kind of problem and gets its own review.
//
// Every path here is expected to be CANONICAL and ABSOLUTE already — `server/infra/canonical-path.ts`
// resolves symlinks and returns the spelling the disk has. Normalising is not repeated here: a
// second normaliser is a second answer, and two answers to "is this the same path" is what
// exclusion cannot survive.
//
// **One gap in that, and it belongs to whoever keys the claims.** `canonicalPath` re-attaches
// components that do not exist yet exactly as they were typed — and a claim is declared BEFORE the
// work, so a path to a file about to be created is the ordinary case. On a case-insensitive volume
// `…/NewThing.ts` and `…/newthing.ts` are then two keys for one file, and two tasks can both claim
// it. `isWithin` folds case on Windows; macOS does not fold, deliberately (see path-within.ts), so
// the registry has to key missing components against the volume's actual case behaviour. Named
// here rather than left to be discovered (raised by CodeRabbit on #1845).
import { byCodeUnit } from "../../common/byCodeUnit.js";
import { isWithin } from "../infra/path-within.js";

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
 * Does one path cover the other?
 *
 * `isWithin` and not a prefix test of its own. That module exists because this exact comparison had
 * been hand-rolled in eight places and was wrong on Windows in two of them, and it carries what a
 * hand-rolled one keeps missing: the platform's own `path` implementation, case folded on Windows,
 * trailing separators and roots handled by `resolve`.
 *
 * What a raw `startsWith` gets wrong, and why this is worth a named function at all: `src/foo` and
 * `src/foobar` are different files. Calling them one exclusion would let two tasks edit both
 * believing they were kept apart.
 */
export const covers = (outer: string, inner: string, platform: NodeJS.Platform = process.platform): boolean => isWithin(outer, inner, platform);

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
