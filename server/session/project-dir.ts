import os from "node:os";
import path from "node:path";
import { accountSessions } from "./registry.js";
import { getAccounts } from "../config/config-routes.js";
import { expandTilde } from "../files/pathContainment.js";
import type { Account } from "../../common/accounts.js";

// Claude Code owns the name of the directory it stores a project's transcripts in;
// we only mirror the rule to FIND what it already wrote. A mismatch throws nothing —
// it reads as "this project has no sessions yet", so --resume silently restarts a
// session and the roster/cost views come back empty. That is why this mirrors the
// upstream implementation character for character (claude 2.1.216) and is pinned by tests.

// Beyond this, claude truncates and appends a hash of the full path to keep the
// name a legal directory entry.
const MAX_ENCODED_LENGTH = 200;

// Claude's 32-bit rolling hash (h * 31 + c, wrapped to int32), rendered base36. The
// exact arithmetic matters: a different hash points at a different directory.
function pathHash(absolutePath: string): string {
  let hash = 0;
  for (let i = 0; i < absolutePath.length; i++) {
    hash = ((hash << 5) - hash + absolutePath.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** The directory name claude stores `absolutePath`'s transcripts under. Every
 *  non-alphanumeric character folds to "-", so distinct paths can collide — that is
 *  upstream's scheme, not ours. Takes an already-absolute path so the rule stays
 *  independent of the host platform's separator. */
export function encodeProjectDirName(absolutePath: string): string {
  const encoded = absolutePath.replace(/[^a-zA-Z0-9]/g, "-");
  if (encoded.length <= MAX_ENCODED_LENGTH) return encoded;
  return `${encoded.slice(0, MAX_ENCODED_LENGTH)}-${pathHash(absolutePath)}`;
}

/**
 * Which `~/.claude`-shaped directory a SESSION's own transcript, history, and everything else
 * Claude Code keeps under `CLAUDE_CONFIG_DIR` actually live under — the plain host default,
 * unless this session is on record (common/accounts.ts, registry.ts's `accountSessions`) as
 * running on a configured account, whose own `configDir` is what the spawn actually gave Claude
 * Code for it (account-env.ts's `accountEnvFor`).
 *
 * Getting this wrong is not a cosmetic miss: without it, EVERY function below that reads a
 * session's transcript looks in the wrong directory for any session on a non-default account —
 * `sessionExistsOnDisk` reports one on disk as absent, `--resume` is never offered for it, and a
 * server restart (the only way an account-picked session's identity can be lost at all, since a
 * live pty or a surviving tmux session both skip this check entirely) mints a brand new session
 * in its place, silently discarding the whole conversation, not merely which account it runs on.
 *
 * `undefined` rather than the resolved default path itself, so a caller passing this straight
 * into `projectSessionsDir` gets that function's own default for the common case (no account)
 * instead of two definitions of "the default" that could drift apart.
 */
// Shared by every function below that has an Account (or none) in hand already, rather than a
// bare id to look one up for: the probe (server/index.ts) resolves its account itself, since a
// probe session is never recorded in accountSessions in the first place (it never goes through
// resolveSessionAccount) — so it calls this directly instead of claudeHomeForSession.
export function claudeHomeForAccount(account: Account | undefined): string | undefined {
  return account ? expandTilde(account.configDir, os.homedir()) : undefined;
}

export function claudeHomeForSession(sessionId: string): string | undefined {
  const accountId = accountSessions.get(sessionId);
  if (!accountId) return undefined;
  return claudeHomeForAccount(getAccounts().find((candidate) => candidate.id === accountId));
}

/** Where claude keeps `cwd`'s session transcripts: `<claudeHome>/projects/<encoded-cwd>/` —
 *  `claudeHome` defaults to the plain `~/.claude`; pass `claudeHomeForSession`'s answer for a
 *  session that might be on a configured account instead. */
export function projectSessionsDir(cwd: string, claudeHome: string = path.join(os.homedir(), ".claude")): string {
  return path.join(claudeHome, "projects", encodeProjectDirName(path.resolve(cwd)));
}

/**
 * Every `~/.claude`-shaped directory a WHOLE-DIRECTORY scan has to check — the plain host
 * default, and every configured account's own directory — because such a scan has no single
 * session id to ask `claudeHomeForSession` about in the first place: it exists precisely to find
 * sessions it does not know about yet, and different sessions under the same `cwd` can
 * legitimately belong to different accounts. `undefined` first, matching `projectSessionsDir`'s
 * own default, so a caller mapping this straight into it needs no special case for "no account".
 *
 * Every caller below merges what it finds across these rather than only ever looking at the
 * first: the roster, the cost roll-up, the decision digest, and the worktree occupancy guard all
 * used to check only the default and would otherwise keep silently missing a whole account's
 * sessions — reading as "there are none" rather than "we did not look".
 */
export function allClaudeHomes(): (string | undefined)[] {
  return [undefined, ...getAccounts().map((account) => claudeHomeForAccount(account))];
}

/** Claude's own log of what a PERSON typed at the prompt — one line per submission, carrying
 *  `display`, `timestamp`, `project` and `sessionId`. Also upstream's file and not ours, so it is
 *  read the same way the directory above is: tolerantly, and with a fallback for the day the
 *  format changes (server/session/prompt-history.ts). */
export function claudeHistoryFile(): string {
  return path.join(os.homedir(), ".claude", "history.jsonl");
}
