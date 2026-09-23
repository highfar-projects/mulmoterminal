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
  /** Deliver the announcement. May be async — the shared publisher stats the file before it
   *  emits — and the poll WAITS for it, because a stamp recorded before delivery is a change
   *  the next watcher will not repeat (codex on #2147). */
  onChanged: () => void | Promise<void>;
  /** False once the last subscriber has gone; the loop stops on the next tick. */
  keepGoing: () => boolean;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  /** What the file looked like when a PREVIOUS watcher on this document stopped. Absent means
   *  this document has not been watched before, and the file as it stands is the baseline. */
  startFrom?: FileStamp;
  /** The stamp subscribers have been brought UP TO DATE with: the baseline they opened on, and
   *  every one that has been announced.
   *
   *  Never a stamp that was read and then dropped because the last subscriber left in the
   *  meantime. Recording that one would tell the next watcher there is nothing to say, and the
   *  change would be lost for good rather than merely late — which is the hole that guarding the
   *  announcement opened, and the reason this is a separate callback rather than a side effect
   *  of reading (codex on #2147). */
  onObserved?: (stamp: FileStamp) => void;
}

/** Announce every change to one file until nobody is watching it any more. */
export async function pollDocument(deps: DocumentPollDeps): Promise<void> {
  // The baseline is what the file looked like when the first View opened it, so opening one
  // does not immediately announce a change nobody made.
  let last = await deps.stamp();
  // Asked after EVERY await, not only after the sleep. Reading the file is a window like any
  // other: the last subscriber can leave inside it, and an announcement made afterwards reaches
  // a room nobody is in — or, when the room has been re-created meanwhile, arrives a second time
  // beside the new watcher's own, because `keepGoing` is this generation's and the new loop has
  // its own (codex on #2147). `alive` per start is the generation token; asking it after each
  // await is what makes it one.
  if (!deps.keepGoing()) return;
  // Unless a previous watcher on this document stopped on something else: then the file moved
  // while nobody was watching, and adopting it silently is how a reconnecting view keeps
  // showing what it had.
  if (deps.startFrom !== undefined && deps.startFrom !== last) await deps.onChanged();
  // Asked again: delivery is itself an await, and a subscriber that left inside it got nothing.
  // Recording the stamp anyway would tell the next watcher the change had landed.
  if (!deps.keepGoing()) return;
  deps.onObserved?.(last);
  while (deps.keepGoing()) {
    await deps.sleep(deps.pollMs ?? DOCUMENT_POLL_MS);
    if (!deps.keepGoing()) return;
    const now = await deps.stamp();
    if (!deps.keepGoing()) return;
    if (now === last) continue;
    last = now;
    // A disappearance is a change too. The views handle a file that is gone — the pane reports
    // it, the card stops showing content that is no longer on disk — and staying silent leaves
    // whatever was last rendered on screen as if it were still true.
    await deps.onChanged();
    if (!deps.keepGoing()) return;
    deps.onObserved?.(last);
  }
}

/** A plugin scope the publisher forwards to, and the files it forwards. */
export interface WatchableScope {
  scope: string;
  matches: (posixPath: string) => boolean;
}

/** The absolute path a channel names, or null when it names nothing this server will watch.
 *
 *  Two gates, and the order matters. The scope gate asks "would a publish on this file reach
 *  this channel" — an unknown scope, or a path that scope does not match, means a watcher that
 *  could only ever stat a file and announce nothing. The containment gate then decides whether
 *  the path is one this server may touch at all: the channel name is a string a browser chose,
 *  so it is contained exactly as any other client-supplied path is, symlinks included.
 *
 *  `contain` is injected rather than done here so this module stays free of the filesystem —
 *  following a symlink is a syscall, and the caller owns which roots are allowed. */
export function resolveWatchableDocument(channel: string, scopes: readonly WatchableScope[], contain: (candidatePath: string) => string | null): string | null {
  const parsed = parsePluginFileChannel(channel);
  if (!parsed) return null;
  if (!scopes.some(({ scope, matches }) => scope === parsed.scope && matches(parsed.path))) return null;
  return contain(parsed.path);
}

/** How many documents may be watched at once.
 *
 *  A room is free; a watcher is a `stat` every second, so this change turns "join a room" into
 *  work the server does on a client's say-so. Nothing else bounds it: a connected page may
 *  subscribe to as many valid channels as it likes, and every one of them would poll until it
 *  disconnects. The cap is on WATCHERS rather than per socket because the poll loop is the
 *  resource — a global ceiling bounds the machine however many pages are open, and pubsub
 *  stays a channel transport that knows nothing about files. */
export const MAX_WATCHED_DOCUMENTS = 64;

export interface DocumentWatchersDeps {
  /** The absolute path this channel names, or null when it names nothing watchable. */
  resolve: (channel: string) => string | null;
  stamp: (absolutePath: string) => Promise<FileStamp>;
  /** Announce on the channel's own path spelling — never a normalised one. Two Views may name
   *  one file differently (the pane has an absolute path, a card may carry a workspace-relative
   *  one), and each hears only the channel it subscribed to.
   *
   *  Return the promise if delivery is async, so the poll can wait for it rather than recording
   *  a stamp the subscribers have not been given. */
  announce: (channelPath: string) => void | Promise<void>;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  maxWatched?: number;
  warn?: (message: string, data?: Record<string, unknown>) => void;
}

/** The set of documents currently being watched, keyed by the channel that asked for each. */
export function createDocumentWatchers(deps: DocumentWatchersDeps) {
  const stopByChannel = new Map<string, () => void>();
  // What the file looked like when each channel was last watched, kept AFTER the watcher stops.
  //
  // Without it a reconnect loses a change: the last subscriber goes, the file is rewritten while
  // nobody is watching, and the watcher that starts for the next subscriber takes the new
  // content as its baseline — so the change that happened in the gap is never announced and the
  // view that reconnected keeps showing what it had. A dropped socket is exactly when this
  // happens, and it is the "sometimes it does not update" this whole change exists to remove.
  const lastSeenByChannel = new Map<string, FileStamp>();
  const limit = deps.maxWatched ?? MAX_WATCHED_DOCUMENTS;

  /** Bounded by the same ceiling as the watchers, so remembering cannot outgrow watching.
   *
   *  Only an entry whose channel is no longer being watched may be dropped. A watched channel's
   *  stamp is the one thing that lets its next watcher tell "nothing happened" from "the file
   *  moved while the socket was down", so evicting it by age would lose exactly the change this
   *  memory exists for (codex on #2147). Every watched channel records its baseline, so the
   *  watched ones never outnumber the ceiling and there is always room for them. */
  const remember = (channel: string, stamp: FileStamp): void => {
    if (lastSeenByChannel.size >= limit && !lastSeenByChannel.has(channel)) {
      const evictable = [...lastSeenByChannel.keys()].find((remembered) => !stopByChannel.has(remembered));
      if (evictable === undefined) return;
      lastSeenByChannel.delete(evictable);
    }
    lastSeenByChannel.set(channel, stamp);
  };

  return {
    /** A channel gained its first subscriber. */
    start(channel: string): void {
      if (stopByChannel.has(channel)) return;
      if (stopByChannel.size >= limit) {
        deps.warn?.("watch limit reached; this document will not live-refresh", { channel, limit });
        return;
      }
      const absolutePath = deps.resolve(channel);
      if (!absolutePath) return;
      const channelPath = parsePluginFileChannel(channel)?.path;
      if (!channelPath) return;
      const previouslySeen = lastSeenByChannel.get(channel);
      let alive = true;
      stopByChannel.set(channel, () => {
        alive = false;
      });
      void pollDocument({
        stamp: () => deps.stamp(absolutePath),
        onObserved: (stamp) => remember(channel, stamp),
        // Carry on from where the last watcher on this document stopped, rather than starting
        // afresh. `undefined` means never watched; a stored `null` means it was absent then.
        ...(previouslySeen === undefined ? {} : { startFrom: previouslySeen }),
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
