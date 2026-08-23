// Where one campaign task has got to. Shared because BOTH sides decide from it: the server
// advances a task, and the cockpit roster renders a pill from the phase it is in — the same
// split `common/prPhase.ts` already makes, and the same drift avoided (rosterPhase.ts used to
// redeclare `PrPhase` under a "keep them in sync" note).
//
// The TRANSITIONS are deliberately not here; they live in `server/campaign/campaign-state.ts`.
// Only the server advances a campaign, so shipping the table to the browser would put the means
// to drive one exactly where nothing is permitted to — see D4 in
// `future/grid-campaign-mode.md`.

export type CampaignPhase =
  | "intake"
  | "planned"
  | "leased"
  | "claimed"
  | "implementing"
  | "self-check"
  | "review"
  | "verify"
  | "merge-queue"
  | "awaiting-approval"
  | "merged"
  | "learn"
  | "orphaned"
  | "done"
  | "rejected"
  | "stopped"
  | "escalated";

// Roughly along the lifecycle, so a client can pick a colour by position. `done` is this file's
// own: the design draws `Learn --> [*]`, and naming that end state is what lets "completing
// Learn releases the path claim" be the same kind of rule as every other release point.
export const CAMPAIGN_PHASES: readonly CampaignPhase[] = [
  "intake",
  "planned",
  "leased",
  "claimed",
  "implementing",
  "self-check",
  "review",
  "verify",
  "merge-queue",
  "awaiting-approval",
  "merged",
  "learn",
  "orphaned",
  "done",
  "rejected",
  "stopped",
  "escalated",
];

export const isCampaignPhase = (v: unknown): v is CampaignPhase => typeof v === "string" && CAMPAIGN_PHASES.some((phase) => phase === v);

// A task is finished in one of four ways. Terminal is what releases the path claim, so this is
// not merely a display distinction.
export const TERMINAL_PHASES: readonly CampaignPhase[] = ["done", "rejected", "stopped", "escalated"];

export const isTerminal = (phase: CampaignPhase): boolean => TERMINAL_PHASES.some((terminal) => terminal === phase);

// `unknown` is a real answer, not a gap: after a crash, whether the task held a clone is not
// knowable until reconciliation reads the disk, and holding one is no guarantee it still works.
// That is why recovery re-enters through `leased` rather than resuming where it fell over.
export type Holding = "held" | "free" | "unknown";

/**
 * Is the task working inside a clone?
 *
 * The clone lease runs `leased` -> `awaiting-approval`: by the time a human is asked, the
 * candidate and the base it was validated against both live on the forge, so nothing is left in
 * the working tree that matters.
 */
export function cloneHolding(phase: CampaignPhase): Holding {
  if (phase === "orphaned") return "unknown";
  const working: readonly CampaignPhase[] = ["leased", "claimed", "implementing", "self-check", "review", "verify", "merge-queue"];
  return working.some((state) => state === phase) ? "held" : "free";
}

/**
 * Does the task hold its exclusive claim over the paths it declared?
 *
 * Two phases answer `unknown`, and in both the phase genuinely does not carry the answer — the
 * campaign's records do, which is why the claim registry and not this function is the authority
 * on who owns what:
 *
 * - `leased` depends on **how it was entered**. From `planned` nothing has been declared yet;
 *   from a send-back, a voided approval, a refused merge or an orphan the task is re-acquiring a
 *   workspace and still owns its paths. Reading this as "free" drops the exclusion on every
 *   recovery — which is when a sibling is most likely to be sitting on those same paths.
 * - `orphaned` depends on **where it crashed**. `planned -> leased -> orphaned` is a real route
 *   and that task never declared anything, so reconciliation has to read the records.
 *
 * Never decide a release from this. `releasesClaim` is that rule, and it holds on every route.
 */
export function claimHolding(phase: CampaignPhase): Holding {
  if (phase === "leased" || phase === "orphaned") return "unknown";
  if (isTerminal(phase) || phase === "intake" || phase === "planned") return "free";
  return "held";
}

/**
 * Entering this phase gives the paths back.
 *
 * The whole rule, and nothing else releases: not `merged` (a crash between the merge and the
 * write-back would leave those paths ownerless while the campaign still has business on them),
 * and not `leased` (see `claimHolding`).
 */
export const releasesClaim = (phase: CampaignPhase): boolean => isTerminal(phase);

/**
 * Can the stop switch or the budget cancel a task here?
 *
 * `merged` and `learn` cannot: the merge is a fact that already happened outside, so there is
 * nothing left to cancel and the right move is to finish recording it. A stop arriving after the
 * merge does not halt the task — "stopped, yet the write-back still ran" is correct behaviour
 * rather than a leak. `orphaned` cannot either: resolve it first and let the stop apply to
 * whatever it resolves to, because stopping without knowing whether it already merged is the
 * most dangerous ordering available.
 */
export function isStoppable(phase: CampaignPhase): boolean {
  if (isTerminal(phase) || phase === "orphaned" || phase === "merged" || phase === "learn") return false;
  // `intake` is supply, not a running task: a stop there stops the supply adapter.
  return phase !== "intake";
}

/**
 * Can the process die out from under a task here, leaving an orphan to reconcile?
 *
 * From `leased` onwards, including `merged` and `learn` — a process dies mid-write-back like
 * anywhere else. `planned` cannot, because nothing has been acquired yet: restart and it is
 * still `planned`.
 */
export function canCrash(phase: CampaignPhase): boolean {
  if (isTerminal(phase) || phase === "orphaned") return false;
  return phase !== "intake" && phase !== "planned";
}
