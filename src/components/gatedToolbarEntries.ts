// Which toolbar entries for an optional feature to offer. An entry for something not set up opens
// onto an empty screen, so it is left out — except while its screen is open, where hiding it would
// leave no way to see where you are.
export type GatedEntry = "prs" | "rooms" | "worklog";

export interface ToolbarSetup {
  prRepoCount: number;
  roomsExist: boolean;
  worklogEnabled: boolean;
}

export type OpenScreens = Record<GatedEntry, boolean>;

export function visibleGatedEntries(setup: ToolbarSetup, open: OpenScreens): Record<GatedEntry, boolean> {
  return {
    prs: setup.prRepoCount > 0 || open.prs,
    rooms: setup.roomsExist || open.rooms,
    worklog: setup.worklogEnabled || open.worklog,
  };
}
