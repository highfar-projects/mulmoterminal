import { describe, it, expect } from "vitest";
import { visibleGatedEntries, type GatedEntry, type ToolbarSetup } from "../../../src/components/gatedToolbarEntries";

const NOTHING_SET_UP: ToolbarSetup = { prRepoCount: 0, roomsExist: false, worklogEnabled: false, tokenRotationOn: false };
const ENTRIES: GatedEntry[] = ["prs", "rooms", "worklog", "usage"];

// Each entry's setup, as the one field that turns it on.
const setUpOnly: Record<GatedEntry, ToolbarSetup> = {
  prs: { ...NOTHING_SET_UP, prRepoCount: 1 },
  rooms: { ...NOTHING_SET_UP, roomsExist: true },
  worklog: { ...NOTHING_SET_UP, worklogEnabled: true },
  usage: { ...NOTHING_SET_UP, tokenRotationOn: true },
};

describe("visibleGatedEntries", () => {
  it("offers nothing when nothing is set up", () => {
    expect(visibleGatedEntries(NOTHING_SET_UP)).toEqual({ prs: false, rooms: false, worklog: false, usage: false });
  });

  it.each(ENTRIES)("offers %s once its own setup is there, and only it", (entry) => {
    const shown = visibleGatedEntries(setUpOnly[entry]);
    ENTRIES.forEach((other) => expect(shown[other]).toBe(other === entry));
  });

  it("offers everything when everything is set up", () => {
    expect(visibleGatedEntries({ prRepoCount: 3, roomsExist: true, worklogEnabled: true, tokenRotationOn: true })).toEqual({
      prs: true,
      rooms: true,
      worklog: true,
      usage: true,
    });
  });

  it("counts any number of repositories above zero, and none below one", () => {
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 0 }).prs).toBe(false);
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 1 }).prs).toBe(true);
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 25 }).prs).toBe(true);
  });
});
