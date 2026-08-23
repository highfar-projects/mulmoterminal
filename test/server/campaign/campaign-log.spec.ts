// @vitest-environment node
//
// The log is the only account of what a campaign did, and every side effect it records happened
// OUTSIDE this process — so the questions worth pinning are all about the gap between the two:
// what a torn write costs, what an intent with nothing after it means, and what the fold refuses
// to believe.
import { describe, it, expect } from "vitest";
import {
  foldCampaignLog,
  idempotencyKey,
  parseCampaignLog,
  pendingTasks,
  recordLine,
  type CampaignRecord,
  type TaskState,
} from "../../../server/campaign/campaign-log.js";
import type { CampaignEvent } from "../../../server/campaign/campaign-state.js";
import type { CampaignPhase } from "../../../common/campaignPhase.js";

const intent = (task: string, event: CampaignEvent, attempt = 1): CampaignRecord => ({ kind: "intent", at: 1, task, attempt, event });
const settled = (task: string, event: CampaignEvent, phase: CampaignPhase, attempt = 1): CampaignRecord => ({
  kind: "settled",
  at: 2,
  task,
  attempt,
  event,
  phase,
});
const abandoned = (task: string, event: CampaignEvent, note: string, attempt = 1): CampaignRecord => ({
  kind: "abandoned",
  at: 2,
  task,
  attempt,
  event,
  note,
});

/** A task carried as far as `phase`, as the pairs of records that really get it there. */
function upTo(task: string, steps: readonly [CampaignEvent, CampaignPhase][]): CampaignRecord[] {
  return steps.flatMap(([event, phase], index) => [intent(task, event, index + 1), settled(task, event, phase, index + 1)]);
}

const TO_IMPLEMENTING: [CampaignEvent, CampaignPhase][] = [
  ["accept", "planned"],
  ["lease", "leased"],
  ["declare", "claimed"],
  ["begin", "implementing"],
];

const only = (tasks: readonly TaskState[]): TaskState => {
  expect(tasks).toHaveLength(1);
  const [task] = tasks;
  if (task === undefined) throw new Error("unreachable");
  return task;
};

describe("the file format", () => {
  it("starts each record on its own line, so a torn write costs one record", () => {
    const contents = [intent("t1", "accept"), settled("t1", "accept", "planned")].map(recordLine).join("");
    // Cut the file mid-record, the way a crash during an append does.
    const torn = contents.slice(0, contents.length - 12);
    expect(parseCampaignLog(torn)).toEqual([intent("t1", "accept")]);
  });

  it("drops an unreadable line on its own, keeping the records around it", () => {
    const contents = `${recordLine(intent("t1", "accept"))}\n{ not json` + recordLine(settled("t1", "accept", "planned"));
    expect(parseCampaignLog(contents)).toEqual([intent("t1", "accept"), settled("t1", "accept", "planned")]);
  });

  it.each([
    ["a record with no kind", '{"at":1,"task":"t","attempt":1,"event":"accept"}'],
    ["an unknown event", '{"kind":"intent","at":1,"task":"t","attempt":1,"event":"teleport"}'],
    ["a settlement with no phase", '{"kind":"settled","at":1,"task":"t","attempt":1,"event":"accept"}'],
    ["a settlement naming no real phase", '{"kind":"settled","at":1,"task":"t","attempt":1,"event":"accept","phase":"Planned"}'],
    ["an abandonment with no note", '{"kind":"abandoned","at":1,"task":"t","attempt":1,"event":"accept"}'],
    ["a task that is not a string", '{"kind":"intent","at":1,"task":7,"attempt":1,"event":"accept"}'],
    ["an array", "[1,2,3]"],
    ["a bare string", '"accept"'],
    ["null", "null"],
  ])("rejects %s", (_label, line) => {
    expect(parseCampaignLog(line)).toEqual([]);
  });

  it("reads an empty file as no records rather than as a problem", () => {
    expect(parseCampaignLog("")).toEqual([]);
    expect(parseCampaignLog("\n\n  \n")).toEqual([]);
  });

  it("keeps the file's order, not the timestamps' — two writers can stamp one millisecond", () => {
    const later: CampaignRecord = { ...intent("t1", "accept"), at: 9999 };
    const earlier: CampaignRecord = { ...intent("t2", "accept"), at: 1 };
    expect(parseCampaignLog(recordLine(later) + recordLine(earlier))).toEqual([later, earlier]);
  });
});

describe("the idempotency key", () => {
  // Derived, never stored: on restart the runner asks the forge whether something with this name
  // already exists, instead of trusting the half of its log that may be missing.
  it("names one attempt at one task in one campaign", () => {
    expect(idempotencyKey("lint-2026", "any-42", 3)).toBe("campaign/lint-2026/any-42/3");
  });

  it("separates attempts, so a retry cannot be mistaken for the first try", () => {
    expect(idempotencyKey("c", "t", 1)).not.toBe(idempotencyKey("c", "t", 2));
  });
});

describe("folding the log", () => {
  it("carries a task through the phases its settlements name", () => {
    const fold = foldCampaignLog(upTo("t1", TO_IMPLEMENTING));
    expect(only(fold.tasks)).toMatchObject({ task: "t1", phase: "implementing", pending: null, attempt: 4 });
    expect(fold.rejected).toEqual([]);
  });

  // The crash window, and the whole reason the format has two halves.
  it("leaves an intent with nothing after it outstanding, without moving the task", () => {
    const fold = foldCampaignLog([...upTo("t1", TO_IMPLEMENTING), intent("t1", "submit", 5)]);
    const task = only(fold.tasks);
    expect(task.phase).toBe("implementing");
    expect(task.pending).toMatchObject({ event: "submit", attempt: 5 });
    expect(pendingTasks(fold)).toHaveLength(1);
  });

  it("reports nothing pending once every intent has an answer", () => {
    expect(pendingTasks(foldCampaignLog(upTo("t1", TO_IMPLEMENTING)))).toEqual([]);
  });

  it("clears the intent on an abandonment and leaves the task where it was", () => {
    const records = [...upTo("t1", TO_IMPLEMENTING), intent("t1", "submit", 5), abandoned("t1", "submit", "the harness never ran", 5)];
    expect(only(foldCampaignLog(records).tasks)).toMatchObject({ phase: "implementing", pending: null, attempt: 5 });
  });

  it("keeps tasks apart", () => {
    const fold = foldCampaignLog([...upTo("t1", TO_IMPLEMENTING), ...upTo("t2", [["accept", "planned"]])]);
    expect(fold.tasks.map(({ task, phase }) => `${task} ${phase}`).sort()).toEqual(["t1 implementing", "t2 planned"]);
  });

  it("has no tasks and no complaints about an empty log", () => {
    expect(foldCampaignLog([])).toEqual({ tasks: [], rejected: [] });
  });
});

describe("what the fold refuses to believe", () => {
  // The log records what happened; it does not get to invent transitions. A settlement naming an
  // edge the machine has not got is a corrupt log, and carrying on from it means carrying on from
  // a state nobody can vouch for.
  it("rejects an intent for an event the phase does not allow", () => {
    const fold = foldCampaignLog([intent("t1", "approve")]);
    expect(fold.tasks).toEqual([]);
    expect(fold.rejected).toEqual([{ record: intent("t1", "approve"), reason: "illegal-transition" }]);
  });

  it("rejects a settlement that answers no intent — a write nobody declared", () => {
    const fold = foldCampaignLog([settled("t1", "accept", "planned")]);
    expect(fold.rejected).toEqual([{ record: settled("t1", "accept", "planned"), reason: "no-intent" }]);
  });

  it("rejects a settlement for a different event than the one outstanding", () => {
    const fold = foldCampaignLog([intent("t1", "accept"), settled("t1", "reject", "rejected")]);
    expect(fold.rejected.map(({ reason }) => reason)).toEqual(["wrong-event"]);
    expect(only(fold.tasks).pending).not.toBeNull();
  });

  it("rejects a settlement for a different attempt, so a stale retry cannot answer a new one", () => {
    const fold = foldCampaignLog([intent("t1", "accept", 2), settled("t1", "accept", "planned", 1)]);
    expect(fold.rejected.map(({ reason }) => reason)).toEqual(["wrong-event"]);
  });

  it("rejects a settlement whose phase is not where that event leads", () => {
    const fold = foldCampaignLog([intent("t1", "accept"), settled("t1", "accept", "merged")]);
    expect(fold.rejected).toEqual([{ record: settled("t1", "accept", "merged"), reason: "phase-mismatch" }]);
    expect(only(fold.tasks).phase).toBe("intake");
  });

  it("rejects a second intent while one is still outstanding", () => {
    const fold = foldCampaignLog([intent("t1", "accept"), intent("t1", "reject", 2)]);
    expect(fold.rejected.map(({ reason }) => reason)).toEqual(["intent-while-pending"]);
    expect(only(fold.tasks).pending).toMatchObject({ event: "accept" });
  });

  it("rejects an abandonment that answers no intent", () => {
    const fold = foldCampaignLog([abandoned("t1", "accept", "never started")]);
    expect(fold.rejected.map(({ reason }) => reason)).toEqual(["no-intent"]);
  });

  it("goes on folding the other tasks when one is corrupt", () => {
    const fold = foldCampaignLog([settled("bad", "accept", "planned"), ...upTo("good", [["accept", "planned"]])]);
    expect(fold.rejected).toHaveLength(1);
    expect(only(fold.tasks)).toMatchObject({ task: "good", phase: "planned" });
  });

  it("accepts nothing more once a task is terminal", () => {
    const done = upTo("t1", [
      ["accept", "planned"],
      ["stop", "stopped"],
    ]);
    const fold = foldCampaignLog([...done, intent("t1", "lease", 3)]);
    expect(fold.rejected.map(({ reason }) => reason)).toEqual(["illegal-transition"]);
    expect(only(fold.tasks).phase).toBe("stopped");
  });
});
