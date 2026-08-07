// A file we GENERATE inside someone else's checkout must never be reached through a symbolic
// link. A repository can commit `.agents/skills.json` — or the `.agents` directory itself — as
// a symlink pointing anywhere (an editor config, a dotfile), and the fs write calls follow
// links, so a routine spawn-time sync would then be reading and overwriting a file OUTSIDE the
// checkout, chosen by whoever authored the repo the user happened to clone (#1544 review).
// Checked with lstat, which never follows.
import { lstatSync } from "node:fs";
import path from "node:path";

const isSymlink = (p: string): boolean => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;

/** True when writing `file` follows no symlink: neither the file nor its parent directory is
 *  one. Missing components are fine — they are about to be created. The parent's own ancestors
 *  are deliberately not walked: the checkout root is the USER'S chosen directory, and links
 *  above it (a symlinked home, `/tmp` on macOS) are their setup, not repo-authored content. */
export function symlinkFreeWriteTarget(file: string): boolean {
  return !isSymlink(path.dirname(file)) && !isSymlink(file);
}
