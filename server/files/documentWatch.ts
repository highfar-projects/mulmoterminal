// Watch the documents someone is actually LOOKING at, so an edit made outside this app —
// the agent in the next cell, an editor, a git checkout — reaches the open view.
//
// Only the open ones: the channel a View subscribes to names ONE file, so a subscription is
// the server's cue to start watching and its last unsubscribe is the cue to stop. Nothing
// recursive over the workspace.
//
// Polling, not fs.watch. An agent's edit lands as a temp file renamed over the target, which
// a path-level watch does not survive — it goes on watching the inode that was replaced, so
// the feature works until the first real edit. And on Windows a watch opened on an 8.3 short
// path makes libuv abort() the whole process, uncatchable (docs/windows-gotchas.md);
// server/session/codex-activity-watch.ts chose polling for that same reason.
//
// Every dependency is injected, so the loop runs against fakes without a filesystem or a clock.
import path from "node:path";
import { parsePluginFileChannel } from "../../common/fileChannel.js";

export const DOCUMENT_POLL_MS = 1000;

/** What one poll compares.
 *
 *  mtime AND size, because mtime alone misses a rewrite that lands inside one tick of the
 *  filesystem's timestamp resolution — and a document being rewritten by an agent is exactly
 *  the rapid case. A spurious announcement costs one refetch; a missed one is the feature not
 *  working, so the comparison errs towards noticing. null = the file is not there. */
export type FileStamp = string | null;

export interface DocumentPollDeps {
  stamp: () => Promise<FileStamp>;
  onChanged: () => void;
  /** False once the last subscriber has gone; the loop stops on the next tick. */
  keepGoing: () => boolean;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
}

/** Announce every change to one file until nobody is watching it any more. */
export async function pollDocument(deps: DocumentPollDeps): Promise<void> {
  // The baseline is what the file looked like when the first View opened it, so opening one
  // does not immediately announce a change nobody made.
  let last = await deps.stamp();
  while (deps.keepGoing()) {
    await deps.sleep(deps.pollMs ?? DOCUMENT_POLL_MS);
    // Asked again after the sleep: the subscriber may have gone while we waited, and a
    // publish then reaches a room nobody is in.
    if (!deps.keepGoing()) return;
    const now = await deps.stamp();
    if (now === last) continue;
    last = now;
    // A disappearance is a change too. The views handle a file that is gone — the pane reports
    // it, the card stops showing content that is no longer on disk — and staying silent leaves
    // whatever was last rendered on screen as if it were still true.
    deps.onChanged();
  }
}

/** A plugin scope the publisher forwards to, and the files it forwards. */
export interface WatchableScope {
  scope: string;
  matches: (posixPath: string) => boolean;
}

/** The absolute path a channel names, or null when nothing would ever be published on it.
 *
 *  The test is deliberately "would a publish on this file reach this channel" — an unknown
 *  scope, or a path that scope does not match, means a watcher that could only ever stat a
 *  file and announce nothing. Purely lexical: the caller does the touching.
 *
 *  A relative path is resolved under the workspace and must stay there. An ABSOLUTE one is
 *  taken as given, because that is already what the by-path file ops accept — presentDocument
 *  opens any `.md` on disk and deliberately has no containment root (backends/openPath.ts),
 *  so refusing one here would refuse to watch documents the app itself opened. */
export function resolveWatchableDocument(channel: string, workspace: string, scopes: readonly WatchableScope[]): string | null {
  const parsed = parsePluginFileChannel(channel);
  if (!parsed) return null;
  if (!scopes.some(({ scope, matches }) => scope === parsed.scope && matches(parsed.path))) return null;
  if (path.isAbsolute(parsed.path)) return parsed.path;
  const root = path.resolve(workspace) + path.sep;
  const abs = path.resolve(root, parsed.path);
  return abs.startsWith(root) ? abs : null;
}

export interface DocumentWatchersDeps {
  /** The absolute path this channel names, or null when it names nothing watchable. */
  resolve: (channel: string) => string | null;
  stamp: (absolutePath: string) => Promise<FileStamp>;
  /** Announce on the channel's own path spelling — never a normalised one. Two Views may name
   *  one file differently (the pane has an absolute path, a card may carry a workspace-relative
   *  one), and each hears only the channel it subscribed to. */
  announce: (channelPath: string) => void;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
}

/** The set of documents currently being watched, keyed by the channel that asked for each. */
export function createDocumentWatchers(deps: DocumentWatchersDeps) {
  const stopByChannel = new Map<string, () => void>();

  return {
    /** A channel gained its first subscriber. */
    start(channel: string): void {
      if (stopByChannel.has(channel)) return;
      const absolutePath = deps.resolve(channel);
      if (!absolutePath) return;
      const channelPath = parsePluginFileChannel(channel)?.path;
      if (!channelPath) return;
      let alive = true;
      stopByChannel.set(channel, () => {
        alive = false;
      });
      void pollDocument({
        stamp: () => deps.stamp(absolutePath),
        onChanged: () => deps.announce(channelPath),
        keepGoing: () => alive,
        sleep: deps.sleep,
        ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
      });
    },

    /** A channel lost its last subscriber. */
    stop(channel: string): void {
      stopByChannel.get(channel)?.();
      stopByChannel.delete(channel);
    },

    stopAll(): void {
      stopByChannel.forEach((stop) => stop());
      stopByChannel.clear();
    },

    /** How many documents are being watched — what a test asserts on, and what a leak shows in. */
    get watching(): number {
      return stopByChannel.size;
    },
  };
}
