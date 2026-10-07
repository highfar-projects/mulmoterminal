// Which toolbar entries for an optional feature to offer. An entry for something not set up opens
// onto an empty screen, so it is left out. There is no exception for an open screen: all three
// live in the grid's own group, which hides under any overlay, their own included.
export type GatedEntry = "prs" | "rooms" | "worklog" | "usage";

export interface ToolbarSetup {
  prRepoCount: number;
  roomsExist: boolean;
  worklogEnabled: boolean;
  /** Token rotation is on with at least one token (#2919): only then is there usage to list. */
  tokenRotationOn: boolean;
}

export function visibleGatedEntries(setup: ToolbarSetup): Record<GatedEntry, boolean> {
  return {
    prs: setup.prRepoCount > 0,
    rooms: setup.roomsExist,
    worklog: setup.worklogEnabled,
    usage: setup.tokenRotationOn,
  };
}
