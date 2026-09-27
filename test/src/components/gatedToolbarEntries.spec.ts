import { describe, it, expect } from "vitest";
import { visibleGatedEntries, type GatedEntry, type OpenScreens, type ToolbarSetup } from "../../../src/components/gatedToolbarEntries";

const NONE_OPEN: OpenScreens = { prs: false, rooms: false, worklog: false };
const NOTHING_SET_UP: ToolbarSetup = { prRepoCount: 0, roomsExist: false, worklogEnabled: false };
const ENTRIES: GatedEntry[] = ["prs", "rooms", "worklog"];

// Each entry's setup, as the one field that turns it on.
const setUpOnly: Record<GatedEntry, ToolbarSetup> = {
  prs: { ...NOTHING_SET_UP, prRepoCount: 1 },
  rooms: { ...NOTHING_SET_UP, roomsExist: true },
  worklog: { ...NOTHING_SET_UP, worklogEnabled: true },
};

describe("visibleGatedEntries", () => {
  it("offers nothing when nothing is set up and nothing is open", () => {
    expect(visibleGatedEntries(NOTHING_SET_UP, NONE_OPEN)).toEqual({ prs: false, rooms: false, worklog: false });
  });

  it.each(ENTRIES)("offers %s once its own setup is there, and only it", (entry) => {
    const shown = visibleGatedEntries(setUpOnly[entry], NONE_OPEN);
    ENTRIES.forEach((other) => expect(shown[other]).toBe(other === entry));
  });

  it.each(ENTRIES)("keeps %s while its screen is open, set up or not", (entry) => {
    const shown = visibleGatedEntries(NOTHING_SET_UP, { ...NONE_OPEN, [entry]: true });
    ENTRIES.forEach((other) => expect(shown[other]).toBe(other === entry));
  });

  it("offers everything when everything is set up", () => {
    expect(visibleGatedEntries({ prRepoCount: 3, roomsExist: true, worklogEnabled: true }, NONE_OPEN)).toEqual({ prs: true, rooms: true, worklog: true });
  });

  it("counts any number of repositories above zero, and none below one", () => {
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 0 }, NONE_OPEN).prs).toBe(false);
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 1 }, NONE_OPEN).prs).toBe(true);
    expect(visibleGatedEntries({ ...NOTHING_SET_UP, prRepoCount: 25 }, NONE_OPEN).prs).toBe(true);
  });
});
