// Which features the toolbar's feature menu lists, from what is set up.
import { describe, it, expect } from "vitest";
import { featureMenuEntries } from "../../../src/components/featureMenuEntries";

const gated = (rooms: boolean, worklog: boolean) => ({ prs: false, rooms, worklog });

describe("featureMenuEntries", () => {
  it("lists all three, in order, once everything is set up", () => {
    expect(featureMenuEntries(gated(true, true))).toEqual(["rooms", "blueprints", "worklog"]);
  });

  it("always offers Blueprints, so the menu is never empty", () => {
    expect(featureMenuEntries(gated(false, false))).toEqual(["blueprints"]);
  });

  it.each([
    [true, false, ["rooms", "blueprints"]],
    [false, true, ["blueprints", "worklog"]],
  ])("rooms=%s worklog=%s lists %j", (rooms, worklog, expected) => {
    expect(featureMenuEntries(gated(rooms, worklog))).toEqual(expected);
  });

  it("ignores the pull-requests gate, which is a toolbar button of its own", () => {
    expect(featureMenuEntries({ prs: true, rooms: false, worklog: false })).toEqual(["blueprints"]);
  });
});
