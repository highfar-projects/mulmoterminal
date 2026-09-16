// Which account each session was started on, as it is read from and written back to disk.
//
// Same shape and the same reason as custom-agent-log.ts, which this mirrors line for line: it has
// to OUTLIVE the pty, because the transcript does. A cell started on the "work" account and then
// exited leaves a resumable session on disk; picking it up again from "or resume here" sends only
// its id, and a resume deliberately ignores the launch form's ACCOUNT select (see
// resolveSessionAccount in spawn-claude.ts — honouring the picker there would move somebody's
// conversation onto a different Claude login mid-thread). So if this mapping died with the
// process, continuing that session would silently drop it back to the host's own `~/.claude`
// login — a different login switched to, from the other direction.
//
// An APPEND LOG, for the reason custom-agent-log.ts gives: ~/.mulmoterminal is one directory for
// every server on the machine, and launching twice is the ordinary way to get two instances. A
// rewritten snapshot has to be read, merged and written back, and two instances doing that at once
// lose whichever finishes first. Appending needs no read.
//
// Its OWN file rather than a widened existing log, for the same reason: these files are shared
// between BUILDS as well as instances, and widening a line format makes an older build's parser
// drop every line of a log it relies on. A file it has never heard of is simply ignored.

export interface AccountSession {
  sessionId: string;
  /** An `accounts` entry's id. Resolved against the CONFIG at every spawn, so a name here is a
   *  claim about what was picked, never a config dir or a token to use directly. */
  accountId: string;
}

/** One line of the log. */
export function accountSessionLine(record: AccountSession): string {
  return `${JSON.stringify(record)}\n`;
}

/**
 * The record a parsed line holds, or null for anything unusable.
 *
 * The account id is checked against the same rule the config accepts, so a line cannot smuggle in
 * a name the picker could never have produced. Nothing here is trusted as a path or a token: the
 * id is only ever looked up in the live config.
 */
export function accountSessionRecord(
  parsed: Record<string, unknown>,
  isValidSessionId: (id: string) => boolean,
  isValidAccountId: (id: unknown) => boolean,
): AccountSession | null {
  const { sessionId, accountId } = parsed;
  if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) return null;
  if (typeof accountId !== "string" || !isValidAccountId(accountId)) return null;
  return { sessionId, accountId };
}

/**
 * Fold one record into the map: the newest line for a session wins.
 *
 * The log only grows, so a session relaunched on a different account appends a second line rather
 * than replacing the first — and reading in file order leaves the last one standing, which is the
 * one that describes how the session runs now.
 */
export function applyAccountSession(sessions: Map<string, string>, record: AccountSession): void {
  sessions.set(record.sessionId, record.accountId);
}
