// Keeps the managed worktree root out of Time Machine and Spotlight on macOS (#3059).
//
// Worktrees are cut and thrown away many times a day, each tens of thousands of files once its
// dependencies are installed, and the OS would back up and index every one of them. Marking the ROOT
// once covers every worktree created inside it later; marking each worktree would put an untracked
// file inside it, which `isDirty` reads as a change and then refuses to remove.
//
// Time Machine: `tmutil addexclusion` without `-p` sets a sticky attribute on the directory —
// measured on macOS 26.5: no sudo needed, the contents are excluded with it, and the attribute goes
// away with the directory. Spotlight: `.metadata_never_index` is the documented marker, but whether
// this macOS honours it was NOT measured — `mdfind` from a terminal returned nothing at all there.
import path from "node:path";
import { messageOf } from "../errors.js";

export const NEVER_INDEX_MARKER = ".metadata_never_index";
const TMUTIL_TIMEOUT_MS = 10_000;

export type IndexingOutcome = "skipped" | "excluded" | "failed";

export interface IndexingExclusionDeps {
  platform: NodeJS.Platform;
  ensureDir: (dir: string) => Promise<void>;
  exists: (file: string) => boolean;
  writeEmptyFile: (file: string) => Promise<void>;
  /** Exit status of `tmutil` with these arguments. */
  tmutil: (args: string[], timeoutMs: number) => Promise<number>;
  warn: (message: string) => void;
}

/** Marks `dir` as excluded from Time Machine and Spotlight. macOS only; never throws — a worktree
 *  that is backed up and indexed is a worktree that works. Returns what was done, for the log. */
export async function excludeFromIndexing(given: string, deps: IndexingExclusionDeps): Promise<IndexingOutcome> {
  if (deps.platform !== "darwin") return "skipped";
  // Absolute, so a relative MULMOTERMINAL_HOME such as `-p` reaches tmutil as an item, not an option.
  const dir = path.resolve(given);
  try {
    await deps.ensureDir(dir);
    const marker = path.join(dir, NEVER_INDEX_MARKER);
    if (!deps.exists(marker)) await deps.writeEmptyFile(marker);
    const status = await deps.tmutil(["addexclusion", dir], TMUTIL_TIMEOUT_MS);
    if (status === 0) return "excluded";
    deps.warn(`[worktrees] tmutil addexclusion ${dir} exited ${status}; worktrees there stay in Time Machine`);
    return "failed";
  } catch (err) {
    deps.warn(`[worktrees] could not exclude ${dir} from Time Machine / Spotlight: ${messageOf(err)}`);
    return "failed";
  }
}

/** `run` once per root, sharing the pending result between concurrent callers. A `failed` outcome is
 *  forgotten, so the next call for that root tries again rather than leaving every later worktree
 *  in Time Machine for the rest of the process. */
export function oncePerRootUnlessFailed(run: (root: string) => Promise<IndexingOutcome>): (root: string) => Promise<IndexingOutcome> {
  const pendingByRoot = new Map<string, Promise<IndexingOutcome>>();
  return (root) => {
    const known = pendingByRoot.get(root);
    if (known) return known;
    const pending = run(root);
    pendingByRoot.set(root, pending);
    void pending.then((outcome) => {
      if (outcome === "failed" && pendingByRoot.get(root) === pending) pendingByRoot.delete(root);
    });
    return pending;
  };
}
