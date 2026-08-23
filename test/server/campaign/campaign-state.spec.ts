// @vitest-environment node
//
// The transition table and the phase predicates are two independent statements about the same
// machine: `campaign-state.ts` says which edges exist, `campaignPhase.ts` says what is true of a
// task sitting in each phase. These specs check the two against each other.
//
// That shape is deliberate. The design this implements went through a review that found the same
// defect fourteen times over: a rule written in one place and not carried into every place it
// governs. Prose could not hold the rule; a predicate compared against the edges can.
import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_PHASES,
  TERMINAL_PHASES,
  isCampaignPhase,
  isTerminal,
  cloneHolding,
  claimHolding,
  releasesClaim,
  isStoppable,
  canCrash,
  type CampaignPhase,
} from "../../../common/campaignPhase.js";
import { CAMPAIGN_EVENTS, advance, eventsFrom, allTransitions, isCampaignEvent } from "../../../server/campaign/campaign-state.js";

const edges = allTransitions();

describe("the table and the predicates agree", () => {
  // The single acquisition point. Without it a task can re-enter work holding no workspace, and
  // the failure is invisible: the phase looks right and there is nowhere to run anything.
  it("acquires a clone only at `leased`", () => {
    const acquisitions = edges.filter(({ from, to }) => cloneHolding(from) !== "held" && cloneHolding(to) === "held");
    expect(acquisitions.map(({ to }) => to)).toEqual(acquisitions.map(() => "leased"));
    expect(acquisitions.length).toBeGreaterThan(0);
  });

  it("never enters `leased` while already holding a clone", () => {
    const doubled = edges.filter(({ from, to }) => to === "leased" && cloneHolding(from) === "held");
    expect(doubled).toEqual([]);
  });

  // Both directions. A missing `stop` is a task the switch cannot reach; a surplus one cancels
  // something that already happened outside.
  it("has a `stop` edge exactly where the phase is stoppable", () => {
    const withStop = CAMPAIGN_PHASES.filter((phase) => advance(phase, "stop") !== null);
    expect(withStop).toEqual(CAMPAIGN_PHASES.filter(isStoppable));
  });

  it("has a `crash` edge exactly where the phase can crash", () => {
    const withCrash = CAMPAIGN_PHASES.filter((phase) => advance(phase, "crash") !== null);
    expect(withCrash).toEqual(CAMPAIGN_PHASES.filter(canCrash));
  });

  it("sends every `stop` to `stopped` and every `crash` to `orphaned`", () => {
    edges.filter(({ event }) => event === "stop").forEach(({ to }) => expect(to).toBe("stopped"));
    edges.filter(({ event }) => event === "crash").forEach(({ to }) => expect(to).toBe("orphaned"));
  });

  // The claim is the exclusion. Dropping it anywhere but at the end lets a sibling task edit the
  // same paths while this one still has business on them.
  it("gives the paths back only on the way to a terminal phase", () => {
    const released = edges.filter(({ from, to }) => claimHolding(from) === "held" && claimHolding(to) === "free");
    released.forEach(({ from, event, to }) => expect({ from, event, to, terminal: isTerminal(to) }).toMatchObject({ terminal: true }));
    expect(released.length).toBeGreaterThan(0);
  });

  // Every way back into work, in one place. Each was added in a different round of the design
  // review and each was written without `leased` the first time, so the useful check is over the
  // category rather than over any one of them.
  it("routes every return to work through `leased`, and none of them gives the paths back", () => {
    const returns = edges.filter(({ from, to }) => to === "leased" && from !== "planned");
    expect(returns.map(({ from, event }) => `${from} ${event}`).sort()).toEqual(["awaiting-approval send-back", "orphaned resolved-in-flight"]);
    returns.forEach(({ from, to }) => {
      expect(claimHolding(from)).not.toBe("free");
      expect(releasesClaim(to)).toBe(false);
    });
  });

  // The hole this closed: `leased -> merge-queue` used to let a task that never declared its
  // paths run all the way to `merged`, with no exclusion over anything it touched.
  it("leaves `leased` only by declaring", () => {
    expect(
      eventsFrom("leased")
        .map((event) => `${event} -> ${advance("leased", event)}`)
        .sort(),
    ).toEqual(["crash -> orphaned", "declare -> claimed", "stop -> stopped"]);
  });

  it("reaches nothing but the start of a task without declaring, and without reconciling", () => {
    // `claimed` is where paths are declared; `orphaned` is where reconciliation reads the records
    // and decides. Refuse both and a task should get nowhere near work, a queue or a merge.
    const seen = new Set<CampaignPhase>(["intake"]);
    const queue: CampaignPhase[] = ["intake"];
    while (queue.length > 0) {
      const phase = queue.shift();
      if (phase === undefined) break;
      eventsFrom(phase).forEach((event) => {
        const next = advance(phase, event);
        if (next === null || next === "claimed" || next === "orphaned" || seen.has(next)) return;
        seen.add(next);
        queue.push(next);
      });
    }
    expect([...seen].sort()).toEqual(["intake", "leased", "planned", "rejected", "stopped"]);
  });
});

describe("the shape of the graph", () => {
  it("accepts no event once terminal", () => {
    TERMINAL_PHASES.forEach((phase) => expect(eventsFrom(phase)).toEqual([]));
  });

  it("can reach every phase from `intake`", () => {
    const seen = new Set<CampaignPhase>(["intake"]);
    const queue: CampaignPhase[] = ["intake"];
    while (queue.length > 0) {
      const phase = queue.shift();
      if (phase === undefined) break;
      eventsFrom(phase).forEach((event) => {
        const next = advance(phase, event);
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
    expect([...CAMPAIGN_PHASES].filter((phase) => !seen.has(phase))).toEqual([]);
  });

  // No traps: a task that can still move must have some route to an ending. Without this a
  // campaign can run forever with nothing to report and nothing a human can close.
  it("can reach an ending from every phase", () => {
    const ends = new Set<CampaignPhase>(TERMINAL_PHASES);
    let grew = true;
    while (grew) {
      grew = false;
      CAMPAIGN_PHASES.forEach((phase) => {
        if (ends.has(phase)) return;
        const reaches = eventsFrom(phase).some((event) => {
          const next = advance(phase, event);
          return next !== null && ends.has(next);
        });
        if (reaches) {
          ends.add(phase);
          grew = true;
        }
      });
    }
    expect([...CAMPAIGN_PHASES].filter((phase) => !ends.has(phase))).toEqual([]);
  });

  // A tripwire, not a property: adding or removing an edge is a design decision, and this makes
  // one show up in the diff instead of arriving silently with an unrelated change.
  it("holds exactly the edges the design draws", () => {
    expect(edges).toHaveLength(42);
    expect(CAMPAIGN_PHASES.length * CAMPAIGN_EVENTS.length - edges.length).toBe(383);
  });

  it("returns null for every pair the table does not carry", () => {
    const legal = new Set(edges.map(({ from, event }) => `${from} ${event}`));
    CAMPAIGN_PHASES.forEach((phase) =>
      CAMPAIGN_EVENTS.forEach((event) => {
        const expected = legal.has(`${phase} ${event}`);
        expect(advance(phase, event) === null).toBe(!expected);
      }),
    );
  });
});

describe("the asymmetries that read as omissions", () => {
  // Named on purpose. Through several review rounds these looked like gaps, and a reader
  // arriving at the table without them written down will reach for the same "fix".
  it("cannot stop `merged` or `learn`, because the merge already happened outside", () => {
    expect(advance("merged", "stop")).toBeNull();
    expect(advance("learn", "stop")).toBeNull();
    expect(advance("merged", "merge-confirmed")).toBe("learn");
    expect(advance("learn", "recorded")).toBe("done");
  });

  it("still lets `merged` and `learn` crash — a process dies mid-write-back like anywhere else", () => {
    expect(advance("merged", "crash")).toBe("orphaned");
    expect(advance("learn", "crash")).toBe("orphaned");
  });

  it("cannot stop `orphaned`: resolve first, then the stop applies to what it resolved to", () => {
    expect(advance("orphaned", "stop")).toBeNull();
    expect(advance("orphaned", "resolved-in-flight")).toBe("leased");
    expect(advance("orphaned", "resolved-merged")).toBe("learn");
    expect(advance("orphaned", "unresolvable")).toBe("escalated");
  });

  it("cannot crash `planned`: nothing has been acquired, so a restart leaves it where it was", () => {
    expect(advance("planned", "crash")).toBeNull();
    expect(canCrash("planned")).toBe(false);
  });

  it("sends a merely-stale base back to the queue from `claimed`, with no implementation to redo", () => {
    expect(advance("claimed", "revalidate")).toBe("merge-queue");
    expect(advance("claimed", "begin")).toBe("implementing");
    // Not from `leased`: `declare` has to sit on every route to the merge.
    expect(advance("leased", "revalidate")).toBeNull();
  });

  it("reports the claim as unknown after a crash — `planned -> leased -> orphaned` never declared", () => {
    expect(advance("planned", "lease")).toBe("leased");
    expect(advance("leased", "crash")).toBe("orphaned");
    expect(claimHolding("orphaned")).toBe("unknown");
  });
});

describe("phase predicates", () => {
  it("reports the clone as unknown after a crash, not as free", () => {
    expect(cloneHolding("orphaned")).toBe("unknown");
  });

  it("reports the claim at `leased` as unknown, because the entry path decides it", () => {
    // Reading this as "free" is what would drop the exclusion on every recovery.
    expect(claimHolding("leased")).toBe("unknown");
    expect(releasesClaim("leased")).toBe(false);
  });

  // Indeterminate is not the same as free. The phase does not carry the answer, but nothing at
  // `orphaned` gives the paths back either — a reconciler that "tidies up" an orphan's claim lets
  // a sibling into paths the orphan may still be halfway through.
  it("never releases an orphan's claim, even though it cannot say whether one exists", () => {
    expect(claimHolding("orphaned")).toBe("unknown");
    expect(releasesClaim("orphaned")).toBe(false);
  });

  it("holds the claim through `merged`, so a crash before the write-back leaves an owner", () => {
    expect(claimHolding("merged")).toBe("held");
    expect(claimHolding("learn")).toBe("held");
    expect(releasesClaim("merged")).toBe(false);
    expect(releasesClaim("done")).toBe(true);
  });

  it("holds no clone while a human is being asked", () => {
    expect(cloneHolding("awaiting-approval")).toBe("free");
    expect(claimHolding("awaiting-approval")).toBe("held");
  });

  it("treats every terminal phase as releasing, and nothing else", () => {
    const releasing = CAMPAIGN_PHASES.filter(releasesClaim);
    expect(releasing).toEqual(CAMPAIGN_PHASES.filter(isTerminal));
  });
});

describe("guards", () => {
  it.each(CAMPAIGN_PHASES)("accepts %s", (phase) => expect(isCampaignPhase(phase)).toBe(true));
  it.each(CAMPAIGN_EVENTS)("accepts the event %s", (event) => expect(isCampaignEvent(event)).toBe(true));

  it.each([null, undefined, 0, "", "Leased", "leased ", {}, ["leased"]])("rejects %o as a phase", (value) => {
    expect(isCampaignPhase(value)).toBe(false);
  });

  it.each([null, undefined, 0, "", "Stop", "stop ", {}, ["stop"]])("rejects %o as an event", (value) => {
    expect(isCampaignEvent(value)).toBe(false);
  });
});
