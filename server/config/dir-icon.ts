// A directory's icon image (#1421): the picture a project puts in its own `.mulmoterminal.json`
// so its cells are recognisable at a glance, the way `name` and the chrome colours already are.
//
// Two shapes, because they are served by different things. A relative path is a file inside the
// project, which only this server can read — confined exactly like `sound` (dir-config.ts) and
// streamed back through /api/dir-icon. An http(s) or data: URL is loaded by the browser itself,
// so nothing here touches it beyond deciding that it is one.
import { existsSync, statSync, realpathSync } from "node:fs";
import path from "node:path";
import { isWithin } from "../infra/path-within.js";
import { DIR_ICON_MAX_CHARS, dirIconMime, isRemoteDirIconUrl } from "../../common/dirIcon.js";

// `ref` is the path AS WRITTEN, kept beside the resolved one because a worktree inherits this
// key: a config derived from an absolute path would be rejected by the very rule that produced
// it (relative only), while the relative path resolves again in the worktree's own tree.
export type DirIcon = { source: "file"; path: string; ref: string; mime: string } | { source: "url"; url: string };

// Confine a configured icon to a real image file INSIDE cwd — the same rule, and the same order
// of checks, as resolveDirSound: relative only, no escaping via "../", and a realpath re-check so
// a symlink inside the directory can't point out of it.
function resolveIconFile(cwd: string, ref: string): DirIcon | null {
  if (path.isAbsolute(ref)) return null;
  const mime = dirIconMime(ref);
  if (!mime) return null;
  const base = path.resolve(cwd);
  const resolved = path.resolve(base, ref);
  if (!isWithin(base, resolved)) return null;
  if (!existsSync(resolved) || !statSync(resolved).isFile()) return null;
  try {
    // .native for the 8.3 reason in files/pathContainment.ts — one spelling of a Windows path.
    if (!isWithin(realpathSync.native(base), realpathSync.native(resolved))) return null;
  } catch {
    return null;
  }
  return { source: "file", path: resolved, ref, mime };
}

/** The icon a directory configured, or null when it configures none / the value is unusable. */
export function resolveDirIcon(cwd: string, input: unknown): DirIcon | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > DIR_ICON_MAX_CHARS) return null;
  if (isRemoteDirIconUrl(raw)) return { source: "url", url: raw };
  return resolveIconFile(cwd, raw);
}

/** What to write into a config file to mean this icon again — the relative path as the user
 *  typed it, or the remote URL. Null when there is no icon to carry. */
export function dirIconRef(icon: DirIcon | null): string | null {
  if (!icon) return null;
  return icon.source === "file" ? icon.ref : icon.url;
}
