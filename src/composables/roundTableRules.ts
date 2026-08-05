// The decisions a round table makes, kept away from the sockets and timers that carry it out —
// the same split `exchangeRules.ts` uses for a two-cell exchange, and for the same reason: the
// ordering is what breaks, and ordering is testable only when it is not tangled with a clock.
//
// A round table is one exchange generalised: instead of self → partner → self, the turn goes
// round a ring of cells until somebody says the group is done, the budget runs out, or the user
// stops it. Nothing here knows about WebSockets, and nothing here is asynchronous.

/** What a speaker writes on its own line to end the round table.
 *
 *  On its own line, and matched whole: an agent discussing when to stop would otherwise end it by
 *  mentioning it. The word is deliberately not English prose for the same reason. */
export const STOP_MARKER = "ROUND-TABLE-DONE";

/** Has this speaker declared the group finished? Read against the RAW reply, never the rendered
 *  handoff — the handoff carries the framing we ourselves wrote, and the instruction that names
 *  the marker is in it. Matching there would stop the table on its own instructions. */
export function wantsToStop(reply: string | null): boolean {
  if (!reply) return false;
  return reply.split("\n").some((line) => line.trim() === STOP_MARKER);
}

/** Has everyone had their say yet?
 *
 *  The opener has: its own last turn is the seed the table starts from. So one lap is complete
 *  once every OTHER member has spoken, which is `members - 1` turns.
 *
 *  This exists because the first live three-cell run ended on turn 1: the first speaker answered,
 *  reasonably decided the group had said what it needed to, and wrote the marker — so the third
 *  cell never spoke at all. A table that can end before it goes round once is not a round table.
 *  The marker is therefore ignored until the lap is done, and the framing says so. */
export const everyoneHasSpoken = (turnsTaken: number, memberCount: number): boolean => turnsTaken >= memberCount - 1;

/** Whether this reply ends the table: the speaker asked to, AND the lap is complete. */
export const endsTheTable = (reply: string | null, turnsTaken: number, memberCount: number): boolean =>
  wantsToStop(reply) && everyoneHasSpoken(turnsTaken, memberCount);

/** Who speaks after the speaker at `index`. A ring, so the last hands back to the first. */
export const nextSpeaker = (index: number, count: number): number => (count > 0 ? (index + 1) % count : 0);

export interface RoundTableFraming {
  /** How this speaker is named to itself, e.g. `#3 · claude`. */
  speaker: string;
  /** Everyone at the table, in speaking order, including the speaker. */
  members: readonly string[];
  /** 1-based, so the first submission reads "turn 1". */
  turn: number;
  /** How many turns the whole table may take. */
  budget: number;
}

/**
 * The framing that goes in front of a handed-over excerpt.
 *
 * PREFIX, never suffix — this is load-bearing, not style. `answersOurSend` correlates a reply to
 * our send by the LAST 160 characters of what we submitted, precisely because the opening lines
 * are identical on every handoff. A constant tail would therefore match the PREVIOUS round's
 * prompt just as well, and the runner would take a turn that was already finished as the answer
 * to a message it had only just sent. Keeping the quoted excerpt at the end keeps the tail unique
 * per round. `roundTablePrompt` below is the only place that assembles the two.
 */
export function framingLines(framing: RoundTableFraming): string {
  const others = framing.members.filter((name) => name !== framing.speaker);
  return [
    `[Round table · turn ${framing.turn} of ${framing.budget} · you are ${framing.speaker}]`,
    others.length ? `Also at the table: ${others.join(", ")}. They will read what you write next.` : "You are alone at the table.",
    // The SAME predicate `endsTheTable` applies, not a restatement of it: the first turn that may
    // legally end the table has to be the first turn that is told how. Written out separately it
    // was off by one — a two-seat table could end on turn 1 but was not shown the marker until
    // turn 2, and a three-seat table not until turn 3 (Codex review on #1456).
    everyoneHasSpoken(framing.turn, framing.members.length)
      ? `When the group has said what it needs to, write ${STOP_MARKER} on a line of its own and the table ends.`
      : `Everyone speaks once before the table can end, so this round is for your own view — say what you actually think.`,
  ].join("\n");
}

/** The whole message submitted to the next speaker: our framing, then the excerpt exactly as the
 *  server rendered it. The excerpt stays last — see framingLines. */
export const roundTablePrompt = (framing: RoundTableFraming, excerpt: string): string => `${framingLines(framing)}\n\n${excerpt}`;

/** Why a round table stopped. The first three are the table working as intended; the rest are the
 *  same conditions a two-cell exchange already reports, reached from a longer loop. */
export type RoundTableOutcome = "agreed" | "budget-spent" | "stopped" | "timed-out" | "nothing-to-send" | "session-changed" | "failed";

const OUTCOME_MESSAGE: Record<RoundTableOutcome, string> = {
  agreed: "The table agreed it was done",
  "budget-spent": "Reached the turn limit",
  stopped: "Stopped",
  "timed-out": "A terminal did not answer in time",
  "nothing-to-send": "No completed turn to pass on",
  "session-changed": "A terminal switched session — stopped",
  failed: "Could not reach a terminal",
};

/** What the cell shows afterwards. Unlike a single exchange — which says nothing on success,
 *  because the answer arriving IS the feedback — a table always reports: several cells moved, and
 *  the reason it ended is the one thing none of them shows. */
export const roundTableMessage = (outcome: RoundTableOutcome): string => OUTCOME_MESSAGE[outcome];

/** Turn budgets a table may be given. Small on purpose: every turn is a real agent turn on a real
 *  account, so this is a cost control as much as a runaway guard. */
export const TURN_BUDGETS = [4, 6, 10, 20] as const;
export const DEFAULT_TURN_BUDGET = 6;

/** How many cells may sit at one table. Beyond this the ring takes so long to come round that the
 *  first speaker's context has moved on by the time it is asked again. */
export const MAX_MEMBERS = 5;

/** Is this a table that can actually be run? Two is the minimum — one cell talking to itself is
 *  the loop with nobody to answer it. */
export const canRunTable = (memberCount: number): boolean => memberCount >= 2 && memberCount <= MAX_MEMBERS;
