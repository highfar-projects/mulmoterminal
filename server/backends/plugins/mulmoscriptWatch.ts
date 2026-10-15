// Watch the MulmoScript files a Canvas view has open, so an edit made outside the plugin — an
// editor, git, the agent's own Edit tool — redraws them (#3014).
//
// The plugin already has the rule: a `scriptChanged` with no `origin` makes every View watching
// that file reload, and a View ignores the echo of its own writes. What was missing is anyone to
// say so when the plugin did not write. The Files pane subscribes to the file's channel while it
// shows the story, which is the cue to watch it here, as the markdown and html views' channels are.
import os from "node:os";
import { canonicalPath } from "../../infra/fs/canonical-path.js";
import { createDocumentWatchers, type FileStamp } from "../../files/documentWatch.js";
import { containForWatching } from "../../files/pathContainment.js";
import { fileStamp, fileStampSync, type SubscriptionSource } from "../files/fileChange.js";
import { MULMOSCRIPT_SCOPE, parsePluginFileChannel } from "../../../common/fileChannel.js";
import { isEchoOfOwnWrite, isScriptPath, scriptFileOnDisk, type ScriptDirs } from "./mulmoscriptWatchRules.js";

/** How many of the plugin's own writes are remembered. One per open story is all the echo check
 *  needs; the bound only keeps a long session from growing it. */
const MAX_REMEMBERED_WRITES = 256;

/** How long a change that is not yet known to be the plugin's own waits before it is announced.
 *  The plugin writes and only then reports the write, with awaits between, so a poll can see its
 *  own edit before the hook has recorded it; announcing that would reload the View under its
 *  own caret. A few event-loop turns is the whole gap — this is a margin, not a measurement. */
const OWN_WRITE_GRACE_MS = 250;

export interface MulmoScriptWatchDeps {
  pubsub: SubscriptionSource;
  /** Where stories live, or null before the plugin backend is initialised. */
  dirs: () => ScriptDirs | null;
  /** The directories a path a browser names may be watched in. */
  roots: () => Iterable<string>;
  /** Tell every View watching `filePath` that it changed, with no origin. */
  publishChanged: (filePath: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  /** The wait before an unrecognised change is announced; injectable so a test can put a write
   *  inside it deterministically. */
  ownWriteGrace?: () => Promise<void>;
}

export function createMulmoScriptWatch() {
  // Keyed by the canonical path, so a story written under one spelling of its directory and
  // watched under another (a symlinked workspace) is still recognised as the same file.
  const ownWrites = new Map<string, FileStamp>();

  /** Called from the plugin's write hook, synchronously, so the stamp is recorded before the
   *  next poll can see the write and mistake it for someone else's. */
  function recordOwnWrite(event: { filePath: string; root?: string }, dirs: ScriptDirs | null): void {
    const onDisk = dirs ? scriptFileOnDisk(event.filePath, event.root, dirs) : null;
    if (!onDisk) return;
    const key = canonicalPath(onDisk);
    ownWrites.delete(key);
    const oldest = ownWrites.size >= MAX_REMEMBERED_WRITES ? ownWrites.keys().next().value : undefined;
    if (oldest !== undefined) ownWrites.delete(oldest);
    ownWrites.set(key, fileStampSync(key));
  }

  function start(deps: MulmoScriptWatchDeps): () => void {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const ownWriteGrace = deps.ownWriteGrace ?? (() => sleep(OWN_WRITE_GRACE_MS));
    const onDisk = (filePath: string): string | null => {
      const dirs = deps.dirs();
      return dirs && isScriptPath(filePath) ? scriptFileOnDisk(filePath, undefined, dirs) : null;
    };
    const watchers = createDocumentWatchers({
      resolve: (channel) => {
        const parsed = parsePluginFileChannel(channel);
        if (parsed?.scope !== MULMOSCRIPT_SCOPE) return null;
        const file = onDisk(parsed.path);
        return file ? containForWatching(deps.roots(), file, os.homedir()) : null;
      },
      stamp: fileStamp,
      // Judged by the stamp that made this watcher notice, never by a fresh read: by then a later
      // write of the plugin's own may have replaced the outside edit, which would be dropped as an
      // echo of it.
      announce: async (channelPath, { observed, absolutePath, isCurrent }) => {
        const key = canonicalPath(absolutePath);
        if (isEchoOfOwnWrite(observed, ownWrites.get(key))) return;
        await ownWriteGrace();
        // The wait can outlive this watcher: if the channel was dropped and subscribed again, the new
        // watcher announces the change itself, and this one would make it twice.
        if (!isCurrent() || isEchoOfOwnWrite(observed, ownWrites.get(key))) return;
        // The channel's own spelling, which is the card's `filePath`: the View compares the two
        // as strings, so any other spelling of the same file would reload nothing.
        deps.publishChanged(channelPath);
      },
      sleep,
      ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
      warn: (message, data) => console.warn(`[mulmo-script] ${message}`, data ?? ""),
    });
    const stopListening = deps.pubsub.onSubscriptionChange((channel, subscribed) => {
      if (subscribed) watchers.start(channel);
      else watchers.stop(channel);
    });
    return () => {
      stopListening();
      watchers.stopAll();
    };
  }

  return { recordOwnWrite, start };
}

/** The one instance the plugin backend records into and the boot starts. */
export const mulmoScriptWatch = createMulmoScriptWatch();
