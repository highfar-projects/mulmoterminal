// What a spawn that threw does with the all-tools claim it may have just recorded (#2848). The
// claim is made before the pty starts (#1338), so a failed spawn is the one moment it can be wrong
// with nobody left to correct it.

export interface ClaimedSpawn {
  /** What `claimFullGuiMcp` answered for this spawn. */
  carriesFullGuiMcp: boolean;
  /** Whether that spawn was about to pick up a process tmux was still running. */
  wouldReattach: boolean;
}

/** Release only what this spawn itself recorded. A reattach recorded nothing: the surviving process
 *  still runs with whatever url it was given, so its claim is not this spawn's to take back. */
export const releasesClaimAfterFailedSpawn = ({ carriesFullGuiMcp, wouldReattach }: ClaimedSpawn): boolean => carriesFullGuiMcp && !wouldReattach;
