// What a past version of this app left on disk, removed once at boot.
//
// Both sweeps are about a feature that is GONE, so neither belongs in the boot sequence's prose:
// what a reader of index.ts needs is that they happen before anything listens, not why.
import { sweepLegacyProbeTranscriptsOnce } from "../agents/probe-transcript.js";
import { removeLegacySandboxCredentials, removeLegacySandboxContainers } from "./fs-cleanup.js";
import { CLAUDE_CWD, MULMOTERMINAL_HOME } from "../config/env.js";

/** Fire-and-forget: every step here is best-effort and none of it may hold up the boot. */
export function runLegacyCleanupsOnce(): void {
  // Probes that ran before their ids identified them left transcripts nothing can address by name
  // — 41 of one reporter's 50 listed sessions (#1010). Swept ONCE on this machine, never again:
  // the content test cannot tell those files from a person who typed the probe's exact words, so
  // the window in which that matters is closed rather than reopened on every boot (Codex review on
  // #1030). It also means a 500MB transcript directory is read once, not once per `yarn dev` save.
  void sweepLegacyProbeTranscriptsOnce(CLAUDE_CWD, MULMOTERMINAL_HOME).catch(() => {});
  // The removed Docker sandbox left two things behind when a server was killed or upgraded
  // mid-session: a per-session export of the Keychain credential on disk, and a container still
  // running with the workspace and ~/.claude mounted. Both deleters went with the feature.
  //
  // The directory is the EVIDENCE that this machine ever ran the sandbox, so the container sweep is
  // gated on it: nearly every install never turned it on (opt-in, macOS-only) and never invokes
  // docker here at all (Codex, PR #1195).
  if (removeLegacySandboxCredentials(MULMOTERMINAL_HOME)) void removeLegacySandboxContainers(MULMOTERMINAL_HOME).catch(() => {});
}
