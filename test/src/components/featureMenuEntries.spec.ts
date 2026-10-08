// Which features the toolbar's feature menu lists, from what is set up.
import { describe, it, expect } from "vitest";
import { featureMenuEntries } from "../../../src/components/featureMenuEntries";

const gated = (rooms: boolean, worklog: boolean, usage = false) => ({ prs: false, rooms, worklog, usage });

describe("featureMenuEntries", () => {
  it("lists all five, in order, once everything is set up", () => {
    expect(featureMenuEntries(gated(true, true))).toEqual(["rooms", "blueprints", "skills", "processes", "worklog"]);
  });

  it("always offers Blueprints, Skills and Processes, so the menu is never empty", () => {
    expect(featureMenuEntries(gated(false, false))).toEqual(["blueprints", "skills", "processes"]);
  });

  it.each([
    [true, false, ["rooms", "blueprints", "skills", "processes"]],
    [false, true, ["blueprints", "skills", "processes", "worklog"]],
  ])("rooms=%s worklog=%s lists %j", (rooms, worklog, expected) => {
    expect(featureMenuEntries(gated(rooms, worklog))).toEqual(expected);
  });

  it("ignores the pull-requests gate, which is a toolbar button of its own", () => {
    expect(featureMenuEntries({ prs: true, rooms: false, worklog: false, usage: false })).toEqual(["blueprints", "skills", "processes"]);
  });

  it("offers token usage last, and only while token rotation is on (#2919)", () => {
    expect(featureMenuEntries(gated(false, false, true))).toEqual(["blueprints", "skills", "processes", "usage"]);
    expect(featureMenuEntries(gated(false, false, false))).not.toContain("usage");
  });
});
