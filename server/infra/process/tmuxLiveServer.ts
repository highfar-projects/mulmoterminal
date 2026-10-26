// The live `-L mulmoterminal` server outlives both this process and a tmux upgrade, so the binary on
// PATH the probe measured may not be the one laying out the sessions the browser reattaches to.

export type LiveTmuxServer = { running: false } | { running: true; version: string | null };

/** Whether a table measured on tmux `probeVersion` describes the live server. A server not running yet
 *  will be started from the same binary; one whose version could not be read is not assumed to match. */
export function measuredForLiveServer(probeVersion: string | null, live: LiveTmuxServer): boolean {
  if (!live.running) return true;
  return probeVersion !== null && live.version === probeVersion;
}

/** Reads `tmux display-message -p '#{version}'` against the live server: absent, a version, or unreadable. */
export function liveServerFrom(result: { status: number | null; stdout: string }, holdsNothing: boolean): LiveTmuxServer {
  if (holdsNothing) return { running: false };
  const version = result.status === 0 ? result.stdout.trim() : "";
  return { running: true, version: version === "" ? null : version };
}
