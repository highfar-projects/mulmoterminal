// The transitions one campaign task may make, and nothing else — no clock, no disk, no forge.
// Server-side because only the server advances a campaign (D4); the browser gets the phase
// names from `common/campaignPhase.ts` so it can render them, and no way to move between them.
//
// Every edge is written out rather than derived from a rule. Two of them look like omissions and
// are not — `merged` and `learn` accept no `stop` — and a rule that generates the common case
// makes a deliberate exception indistinguishable from a forgotten one. The invariants those
// rules would have stated live in `common/campaignPhase.ts` as predicates, and a spec compares
// the two statements against each other; that comparison is the point of keeping them apart.

import type { CampaignPhase } from "../../common/campaignPhase.js";
import { CAMPAIGN_PHASES } from "../../common/campaignPhase.js";

/**
 * What the runner observed. Never what it wants to happen next: the phase decides that, which is
 * what keeps progression outside any one agent's context (principle 2 of the pipeline).
 */
export type CampaignEvent =
  | "accept"
  | "reject"
  | "lease"
  | "declare"
  | "begin"
  | "revalidate"
  | "submit"
  | "self-check-failed"
  | "self-check-passed"
  | "review-blocking"
  | "review-passed"
  | "verify-failed"
  | "verify-passed"
  | "integration-broke"
  | "request-approval"
  | "approve"
  | "send-back"
  | "auto-merge"
  | "merge-confirmed"
  | "recorded"
  | "crash"
  | "stop"
  | "resolved-in-flight"
  | "resolved-merged"
  | "unresolvable";

export const CAMPAIGN_EVENTS: readonly CampaignEvent[] = [
  "accept",
  "reject",
  "lease",
  "declare",
  "begin",
  "revalidate",
  "submit",
  "self-check-failed",
  "self-check-passed",
  "review-blocking",
  "review-passed",
  "verify-failed",
  "verify-passed",
  "integration-broke",
  "request-approval",
  "approve",
  "send-back",
  "auto-merge",
  "merge-confirmed",
  "recorded",
  "crash",
  "stop",
  "resolved-in-flight",
  "resolved-merged",
  "unresolvable",
];

export const isCampaignEvent = (v: unknown): v is CampaignEvent => typeof v === "string" && CAMPAIGN_EVENTS.some((event) => event === v);

type Edges = Partial<Record<CampaignEvent, CampaignPhase>>;

const TRANSITIONS: Record<CampaignPhase, Edges> = {
  intake: { accept: "planned", reject: "rejected" },
  planned: { lease: "leased", stop: "stopped" },
  // `revalidate` skips `claimed` on purpose: a task whose base merely went stale already
  // declared its paths and still holds them, so there is nothing left to claim.
  leased: { declare: "claimed", revalidate: "merge-queue", crash: "orphaned", stop: "stopped" },
  claimed: { begin: "implementing", crash: "orphaned", stop: "stopped" },
  implementing: { submit: "self-check", crash: "orphaned", stop: "stopped" },
  "self-check": { "self-check-failed": "implementing", "self-check-passed": "review", crash: "orphaned", stop: "stopped" },
  review: { "review-blocking": "implementing", "review-passed": "verify", crash: "orphaned", stop: "stopped" },
  verify: { "verify-failed": "implementing", "verify-passed": "merge-queue", crash: "orphaned", stop: "stopped" },
  // `auto-merge` is reachable only where a deployment protects the policy store. On the trust
  // model this repo accepts, the merge conditions are read from state the merged party can
  // write, so the profile asks a human instead — see decision 4.
  "merge-queue": {
    "integration-broke": "implementing",
    "request-approval": "awaiting-approval",
    "auto-merge": "merged",
    crash: "orphaned",
    stop: "stopped",
  },
  // One edge covers the send-back, the approval voided by a moved candidate or base, and the
  // merge the forge refused. All three land in the same place for the same reason: the clone was
  // handed back on the way in, so there is no workspace to revalidate in.
  "awaiting-approval": { approve: "merged", "send-back": "leased", crash: "orphaned", stop: "stopped" },
  merged: { "merge-confirmed": "learn", crash: "orphaned" },
  learn: { recorded: "done", crash: "orphaned" },
  // No `stop`: resolve first, then let the stop apply to whatever it resolves to.
  orphaned: { "resolved-in-flight": "leased", "resolved-merged": "learn", unresolvable: "escalated" },
  done: {},
  rejected: {},
  stopped: {},
  escalated: {},
};

/** The phase this event moves the task to, or null when the event cannot happen here. */
export const advance = (phase: CampaignPhase, event: CampaignEvent): CampaignPhase | null => TRANSITIONS[phase][event] ?? null;

/** Every event this phase accepts. For a runner deciding what it is even allowed to look for. */
export const eventsFrom = (phase: CampaignPhase): readonly CampaignEvent[] => CAMPAIGN_EVENTS.filter((event) => advance(phase, event) !== null);

export interface CampaignTransition {
  from: CampaignPhase;
  event: CampaignEvent;
  to: CampaignPhase;
}

/**
 * Every (from, event, to) the machine allows.
 *
 * Enumerated through `advance` rather than read off the table, so a spec asserting a property
 * over "every edge" is asserting it over the edges callers actually get.
 */
export function allTransitions(): readonly CampaignTransition[] {
  return CAMPAIGN_PHASES.flatMap((from) =>
    eventsFrom(from).flatMap((event) => {
      const to = advance(from, event);
      return to === null ? [] : [{ from, event, to }];
    }),
  );
}
