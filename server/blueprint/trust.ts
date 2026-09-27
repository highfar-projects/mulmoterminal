// Whether Claude Code will start in a directory without asking "Do you trust this folder?". A step's
// session runs unattended, so an unanswered trust prompt stalls it until it is reaped — and the
// executor must never answer that prompt itself: trusting a folder is the person's decision (the
// rate-limit probe refuses to press Enter on it for the same reason).
//
// Claude Code looks for trust from the directory upward — but inside a git repository only as far as
// the repository's root. Measured with claude 2.1.282: a new directory under a trusted parent starts
// at the input box; the same directory, once `git init` has run in it, asks again; a subdirectory of
// a trusted repository does not ask. A git WORKTREE is the exception: its `.git` is a file, and Claude
// Code takes its trust from the main repository's root, not from the worktree's parents — and records
// the answer to the prompt there too (measured with 2.1.283: a worktree of a trusted repository in an
// untrusted place does not ask; a worktree of an untrusted one under a trusted parent does).
import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { isRecord } from "../../common/isRecord.js";
import { claudeUserConfigFile } from "../session/project-dir.js";

const ancestorsOf = (dir: string): string[] => {
  const parent = path.dirname(dir);
  return parent === dir ? [dir] : [dir, ...ancestorsOf(parent)];
};

const accepted = (entry: unknown): boolean => isRecord(entry) && entry.hasTrustDialogAccepted === true;

/** The directories whose trust counts for `dir`: up to `gitRoot` when it is in a repository. */
export function trustCandidates(dir: string, gitRoot: string | null): string[] {
  const all = ancestorsOf(path.resolve(dir));
  if (!gitRoot) return all;
  const rootIndex = all.indexOf(path.resolve(gitRoot));
  // A root that is not above `dir` says nothing true about it; trust nothing rather than everything.
  return rootIndex < 0 ? [] : all.slice(0, rootIndex + 1);
}

// Keys are resolved the same way as the candidates, so a key written with the other separator still
// matches — on Windows path.resolve turns "/Users/me" into "C:\Users\me" and "C:/x" into "C:\x".
const trustedDirs = (projects: Record<string, unknown>): Set<string> =>
  new Set(
    Object.entries(projects)
      .filter(([, entry]) => accepted(entry))
      .map(([key]) => path.resolve(key)),
  );

/**
 * Pure: `projects` is the `projects` map of Claude Code's config, as read. `mainRoot` is the main
 * repository's root when `dir` is in a worktree of it; then trust recorded there is the only trust that counts.
 */
export function isTrustedByClaude(dir: string, projects: unknown, gitRoot: string | null = null, mainRoot: string | null = null): boolean {
  if (!isRecord(projects)) return false;
  const trusted = trustedDirs(projects);
  // Only the main root was measured to count for a worktree; trusting more could start a session that stalls on the prompt.
  const candidates = mainRoot ? [path.resolve(mainRoot)] : trustCandidates(dir, gitRoot);
  return candidates.some((candidate) => trusted.has(candidate));
}

/** Pure: the `gitdir:` a worktree's `.git` file points at, resolved against the worktree's root; null for anything else. */
export function gitdirOf(gitFile: string, worktreeRoot: string): string | null {
  const line = gitFile.split(/\r?\n/u).find((entry) => entry.startsWith("gitdir:"));
  const target = line?.slice("gitdir:".length).trim();
  return target ? path.resolve(worktreeRoot, target) : null;
}

const readText = (file: string): Promise<string | null> => readFile(file, "utf8").catch(() => null);

/**
 * The main repository's root when `gitRoot` is a worktree of it, else null. A worktree's gitdir holds a
 * `commondir` naming the shared `.git`; a submodule's `.git` file points at a gitdir without one, and a
 * worktree of a bare repository has no main checkout — both are left alone.
 */
export async function mainRootOf(gitRoot: string): Promise<string | null> {
  // A .git directory cannot be read as a file, so the main checkout falls out here too.
  const gitdir = gitdirOf((await readText(path.join(gitRoot, ".git"))) ?? "", gitRoot);
  const commondir = gitdir ? (await readText(path.join(gitdir, "commondir")))?.trim() : undefined;
  if (!gitdir || !commondir) return null;
  const common = path.resolve(gitdir, commondir);
  return path.basename(common) === ".git" ? path.dirname(common) : null;
}

const hasGitEntry = (dir: string): Promise<boolean> =>
  access(path.join(dir, ".git")).then(
    () => true,
    () => false,
  );

/** The nearest directory at or above `dir` holding a `.git`, or null. */
export async function gitRootOf(dir: string): Promise<string | null> {
  const found = await Promise.all(ancestorsOf(path.resolve(dir)).map(async (candidate) => ((await hasGitEntry(candidate)) ? candidate : null)));
  return found.find((candidate) => candidate !== null) ?? null;
}

/** Reads Claude Code's config; a missing or unreadable file trusts nothing. */
export async function claudeTrusts(dir: string, configFile: string = claudeUserConfigFile()): Promise<boolean> {
  try {
    const config: unknown = JSON.parse(await readFile(configFile, "utf8"));
    const gitRoot = await gitRootOf(dir);
    return isRecord(config) && isTrustedByClaude(dir, config.projects, gitRoot, gitRoot ? await mainRootOf(gitRoot) : null);
  } catch {
    return false;
  }
}
