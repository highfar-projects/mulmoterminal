import { describe, it, expect } from "vitest";
import { runRoundTable, type RoundTableDeps, type TableMember } from "../../../src/composables/useRoundTable";
import type { TurnFetch } from "../../../src/composables/useCrossTalk";
import type { HandoffSource } from "../../../src/composables/useHandoff";
import { STOP_MARKER } from "../../../src/composables/roundTableRules";

const src = (id: string): HandoffSource => ({ sessionId: id, cwd: "/w", agent: "claude" });
const seat = (n: number): TableMember => ({ key: `cell-${n}`, label: `#${n}`, source: src(String.fromCharCode(64 + n)) });
const TABLE = [seat(1), seat(2), seat(3)]; // A, B, C

interface HarnessOptions {
  /** A reply that ends the table, keyed by how many turns have been taken when it is produced. */
  stopAfter?: number;
  /** Never record a reply, so the table waits and times out. */
  silent?: boolean;
  /** The socket refuses the submit — a cell that went away between the check and the send. */
  submitFails?: boolean;
}

// Three fake terminals round a ring. A real agent records what it was SENT as its prompt, and the
// runner correlates on exactly that — so the fake has to do the same or nothing ever matches.
function harness(options: HarnessOptions = {}) {
  const turns: Record<string, TurnFetch> = {
    A: { prompt: "the user asked", reply: "A's opening position", text: "OPENING-FROM-A" },
    B: { prompt: null, reply: null, text: "" },
    C: { prompt: null, reply: null, text: "" },
  };
  const submitted: Array<{ key: string; text: string }> = [];
  let clock = 0;
  let aborted = false;
  let sessionsIntact = true;
  let taken = 0;

  const deps: RoundTableDeps = {
    fetchTurn: async (source) => ({ ...(turns[source.sessionId] ?? { prompt: null, reply: null, text: "" }) }),
    submit: (key, text) => {
      if (options.submitFails) return false;
      submitted.push({ key, text });
      if (options.silent) return true;
      taken += 1;
      const id = key.replace("cell-", "");
      const who = String.fromCharCode(64 + Number(id));
      const done = options.stopAfter === taken;
      turns[who] = { prompt: text, reply: done ? `We are aligned.\n${STOP_MARKER}` : `${who} says ${taken}`, text: `EXCERPT-${who}-${taken}` };
      return true;
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    isAborted: () => aborted,
    runsSession: () => sessionsIntact,
  };
  return { deps, submitted, abort: () => (aborted = true), switchSession: () => (sessionsIntact = false) };
}

describe("runRoundTable", () => {
  // The point of the whole feature: a turn goes round three cells without a human between them.
  it("passes the turn round the ring, starting one seat along from the opener", async () => {
    const h = harness();
    const { outcome, turnsTaken } = await runRoundTable(TABLE, 6, h.deps);
    expect(outcome).toBe("budget-spent");
    expect(turnsTaken).toBe(6);
    // Never the opener first — its turn is the seed, so it speaks again only after a full lap.
    expect(h.submitted.map((s) => s.key)).toEqual(["cell-2", "cell-3", "cell-1", "cell-2", "cell-3", "cell-1"]);
  });

  it("carries each speaker's answer to the next one, not the original seed", async () => {
    const h = harness();
    await runRoundTable(TABLE, 3, h.deps);
    expect(h.submitted[0]?.text).toContain("OPENING-FROM-A"); // the seed opens the table…
    expect(h.submitted[1]?.text).toContain("EXCERPT-B-1"); // …then what B said goes to C
    expect(h.submitted[2]?.text).toContain("EXCERPT-C-2"); // …and what C said goes back to A
  });

  it("tells each speaker whose turn it is and who else is at the table", async () => {
    const h = harness();
    await runRoundTable(TABLE, 1, h.deps);
    const sent = h.submitted[0]?.text ?? "";
    expect(sent).toContain("you are #2");
    expect(sent).toContain("#1, #3");
    expect(sent).toContain("turn 1 of 1");
  });

  // A table of two is the existing exchange, reached through the same loop.
  it("alternates a two-cell table", async () => {
    const h = harness();
    const { outcome } = await runRoundTable([seat(1), seat(2)], 4, h.deps);
    expect(outcome).toBe("budget-spent");
    expect(h.submitted.map((s) => s.key)).toEqual(["cell-2", "cell-1", "cell-2", "cell-1"]);
  });

  it("ends as soon as a speaker declares the group done", async () => {
    const h = harness({ stopAfter: 2 });
    const { outcome, turnsTaken } = await runRoundTable(TABLE, 10, h.deps);
    expect(outcome).toBe("agreed");
    expect(turnsTaken).toBe(2);
    expect(h.submitted).toHaveLength(2); // it does not hand the turn on after the marker
  });

  it("stops at the budget even when nobody says they are done", async () => {
    const h = harness();
    const { outcome, turnsTaken } = await runRoundTable(TABLE, 2, h.deps);
    expect(outcome).toBe("budget-spent");
    expect(turnsTaken).toBe(2);
  });

  it("sends nothing when the opening cell has no completed turn", async () => {
    const h = harness();
    const { outcome } = await runRoundTable([{ ...seat(9), source: src("Z") }, seat(2)], 4, h.deps);
    expect(outcome).toBe("nothing-to-send");
    expect(h.submitted).toHaveLength(0);
  });

  it("stops when the user stops it", async () => {
    const h = harness();
    h.abort();
    const { outcome } = await runRoundTable(TABLE, 4, h.deps);
    expect(outcome).toBe("stopped");
    expect(h.submitted).toHaveLength(0);
  });

  // A submit addresses a SLOT. A cell whose session was switched underneath would be handed a
  // conversation it was never part of.
  it("stops rather than typing into a cell that switched session", async () => {
    const h = harness();
    h.switchSession();
    const { outcome } = await runRoundTable(TABLE, 4, h.deps);
    expect(outcome).toBe("session-changed");
    expect(h.submitted).toHaveLength(0);
  });

  it("gives up on a member that never answers", async () => {
    const h = harness({ silent: true });
    const { outcome } = await runRoundTable(TABLE, 4, h.deps);
    expect(outcome).toBe("timed-out");
    expect(h.submitted).toHaveLength(1); // it waited on the first member rather than moving on
  });

  it("reports a failure to reach a terminal instead of throwing", async () => {
    const h = harness({ submitFails: true });
    expect(await runRoundTable(TABLE, 4, h.deps)).toEqual({ outcome: "failed", turnsTaken: 0 });
    expect(h.submitted).toHaveLength(0);
  });
});
