import os from "node:os";
import path from "node:path";
import { accountSessions } from "./registry.js";
import { getAccounts } from "../config/config-routes.js";
import { expandTilde } from "../files/pathContainment.js";

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
export function claudeHomeForSession(sessionId: string): string | undefined {
  const accountId = accountSessions.get(sessionId);
  if (!accountId) return undefined;
  const account = getAccounts().find((candidate) => candidate.id === accountId);
  return account ? expandTilde(account.configDir, os.homedir()) : undefined;
}

/** Where claude keeps `cwd`'s session transcripts: `<claudeHome>/projects/<encoded-cwd>/` —
 *  `claudeHome` defaults to the plain `~/.claude`; pass `claudeHomeForSession`'s answer for a
 *  session that might be on a configured account instead. */
export function projectSessionsDir(cwd: string, claudeHome: string = path.join(os.homedir(), ".claude")): string {
  return path.join(claudeHome, "projects", encodeProjectDirName(path.resolve(cwd)));
}

/** Claude's own log of what a PERSON typed at the prompt — one line per submission, carrying
 *  `display`, `timestamp`, `project` and `sessionId`. Also upstream's file and not ours, so it is
 *  read the same way the directory above is: tolerantly, and with a fallback for the day the
 *  format changes (server/session/prompt-history.ts). */
export function claudeHistoryFile(): string {
  return path.join(os.homedir(), ".claude", "history.jsonl");
}
