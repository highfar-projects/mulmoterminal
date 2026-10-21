import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentHome } from "../agents/agent-homes.js";

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

/** Every project's transcript directory sits under this: ~/.claude/projects/ */
export function claudeProjectsRoot(home: string = agentHome("claude")): string {
  return path.join(home, "projects");
}

// A cell polls a path that reaches this every few seconds, and the workspace may be on a network
// share, so a resolved path is kept for a short while: one system call per path per window, and a
// symlink pointed somewhere else is still followed within it. A failure is not kept.
export const REALPATH_MEMO_MS = 30_000;

export function memoizeRealpath(realpath: (absolutePath: string) => string, now_ms: () => number = Date.now, memo_ms: number = REALPATH_MEMO_MS) {
  const resolved = new Map<string, { realPath: string; at_ms: number }>();
  const resolve = (absolutePath: string): string => {
    const held = resolved.get(absolutePath);
    if (held && now_ms() - held.at_ms < memo_ms) return held.realPath;
    const realPath = realpath(absolutePath);
    // Expired entries go whenever one is added, so the map holds only the paths asked for lately.
    resolved.forEach((entry, key) => {
      if (now_ms() - entry.at_ms >= memo_ms) resolved.delete(key);
    });
    resolved.set(absolutePath, { realPath, at_ms: now_ms() });
    return realPath;
  };
  return Object.assign(resolve, { size: (): number => resolved.size });
}

const memoizedRealpath = memoizeRealpath(realpathSync.native);

/** The path claude names `cwd`'s transcript directory after: the real one. Claude resolves symlinks
 *  first, and takes the case the disk spells (a cwd typed `casedir` lands under `CaseDir`), which is
 *  what `realpathSync.native` returns and plain `realpathSync` does not. A path that cannot be
 *  resolved (gone, unreadable) falls back to the absolute form, the name it would have had before. */
export function claudeProjectPath(cwd: string, realpath: (absolutePath: string) => string = memoizedRealpath): string {
  const absolutePath = path.resolve(cwd);
  try {
    return realpath(absolutePath);
  } catch {
    return absolutePath;
  }
}

/** Where claude keeps `cwd`'s session transcripts: ~/.claude/projects/<encoded-real-cwd>/ */
export function projectSessionsDir(cwd: string, home: string = agentHome("claude")): string {
  return path.join(claudeProjectsRoot(home), encodeProjectDirName(claudeProjectPath(cwd)));
}

/** Claude's own log of what a PERSON typed at the prompt — one line per submission, carrying
 *  `display`, `timestamp`, `project` and `sessionId`. Also upstream's file and not ours, so it is
 *  read the same way the directory above is: tolerantly, and with a fallback for the day the
 *  format changes (server/session/transcript/prompt-history.ts). */
export function claudeHistoryFile(home: string = agentHome("claude")): string {
  return path.join(home, "history.jsonl");
}

/** Claude Code's own config file, where `claude mcp add -s local` writes. NOT under the config
 *  home: it defaults to ~/.claude.json and moves INTO CLAUDE_CONFIG_DIR when that is set. */
export function claudeUserConfigFile(): string {
  return path.join(process.env.CLAUDE_CONFIG_DIR || os.homedir(), ".claude.json");
}

/** User-scope skills (~/.claude/skills), runnable from any directory. */
export function claudeUserSkillsDir(home: string = agentHome("claude")): string {
  return path.join(home, "skills");
}
