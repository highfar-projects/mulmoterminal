// The decisions behind watching an open MulmoScript for edits made outside the plugin (#3014),
// kept pure so each can be pinned without a filesystem.
import path from "node:path";
import type { FileStamp } from "../../files/documentWatch.js";

/** The prefix a story under a stories root carries on the wire (`stories/<tail>`). */
const STORY_WIRE_PREFIX = "stories/";

/** Where the plugin keeps stories: its default directory, and each registered root by id. */
export interface ScriptDirs {
  storiesDir: string;
  rootDirs: ReadonlyMap<string, string>;
}

/** The file a MulmoScript `filePath` names on disk, resolved the way the plugin resolves it, or
 *  null when it names nothing the plugin would open.
 *
 *  An absolute path is itself (the `byPath` form). `stories/<tail>` is the tail under the named
 *  root — the plugin strips `stories/` before its FileOps sees it — or under the default stories
 *  directory when no root is named. A root is trimmed as the plugin's `normalizeRoot` does, so an
 *  event and a channel that differ only in spacing name one file. */
export function scriptFileOnDisk(filePath: string, root: string | undefined, dirs: ScriptDirs): string | null {
  if (path.isAbsolute(filePath)) return path.resolve(filePath);
  if (!filePath.startsWith(STORY_WIRE_PREFIX)) return null;
  const tail = filePath.slice(STORY_WIRE_PREFIX.length);
  if (tail === "") return null;
  const rootId = typeof root === "string" ? root.trim() : "";
  const base = rootId === "" ? dirs.storiesDir : dirs.rootDirs.get(rootId);
  return base === undefined ? null : path.resolve(base, tail);
}

/** Whether a path is one a MulmoScript can live at. The plugin decides whether the contents are a
 *  script; this only keeps the watcher from polling files no story could be. */
export const isScriptPath = (filePath: string): boolean => /\.json$/i.test(filePath);

/** Whether a change the watcher saw is the plugin's own last write, which the plugin has already
 *  announced with its View's `origin`. Announcing it again without one would make the View that
 *  wrote it reload under the caret. A file that is gone is never an echo. */
export const isEchoOfOwnWrite = (current: FileStamp, ownWrite: FileStamp | undefined): boolean => current !== null && current === ownWrite;
