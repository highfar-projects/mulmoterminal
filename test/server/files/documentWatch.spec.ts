// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  createDocumentWatchers,
  MAX_WATCHED_DOCUMENTS,
  pollDocument,
  resolveWatchableDocument,
  type FileStamp,
  type WatchableScope,
} from "../../../server/files/documentWatch";

const SCOPES: readonly WatchableScope[] = [
  { scope: "markdown", matches: (p) => /\.md$/i.test(p) },
  { scope: "html", matches: (p) => /\.html?$/i.test(p) },
];
const WORKSPACE = path.resolve("/ws");

/** Drive the loop with a script of stamps, one per tick — the first being what the file looked
 *  like when the watch started. No clock, no filesystem: the sleep IS the tick. */
async function announcementsFor(stamps: readonly FileStamp[]): Promise<number> {
  let tick = 0;
  let announced = 0;
  await pollDocument({
    stamp: async () => stamps[tick] ?? null,
    onChanged: () => {
      announced += 1;
    },
    keepGoing: () => tick < stamps.length,
    sleep: async () => {
      tick += 1;
    },
  });
  return announced;
}

describe("pollDocument", () => {
  // Opening a document is not an edit of it. Announcing the baseline would make every View
  // refetch the moment it appeared, for a change nobody made.
  it("says nothing about the file it started from", async () => {
    expect(await announcementsFor(["a"])).toBe(0);
  });

  it("says nothing while the file is unchanged", async () => {
    expect(await announcementsFor(["a", "a", "a"])).toBe(0);
  });

  it("announces a change once", async () => {
    expect(await announcementsFor(["a", "b", "b"])).toBe(1);
  });

  it("announces each further change", async () => {
    expect(await announcementsFor(["a", "b", "c"])).toBe(2);
  });

  // A file that is gone is not a file that is unchanged: whatever was last rendered is still on
  // screen, and staying silent leaves it there looking current.
  it("announces a disappearance", async () => {
    expect(await announcementsFor(["a", null])).toBe(1);
  });

  it("announces a file that appears", async () => {
    expect(await announcementsFor([null, "a"])).toBe(1);
  });

  it("stops once nobody is watching", async () => {
    const stamp = vi.fn(async () => "a");
    await pollDocument({ stamp, onChanged: () => {}, keepGoing: () => false, sleep: async () => {} });
    // Only the baseline read — the loop never entered.
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  // The other window, and the one that was open: reading the file is an await too. A subscriber
  // that leaves while the stat is in flight would otherwise be announced to anyway — and if the
  // room came back in the meantime, announced to TWICE, once by this dead loop and once by the
  // live one (codex on #2147).
  it("does not announce a change it read while the last subscriber was leaving", async () => {
    let watching = true;
    let reads = 0;
    const onChanged = vi.fn();
    await pollDocument({
      stamp: async () => {
        reads += 1;
        if (reads === 1) return "original";
        // The departure lands inside the IN-LOOP read, not inside the sleep and not before the
        // loop is entered — the two windows the other guards cover.
        watching = false;
        return "changed";
      },
      onChanged,
      keepGoing: () => watching,
      sleep: async () => {},
    });
    expect(reads).toBe(2);
    expect(onChanged).not.toHaveBeenCalled();
  });

  // The same window on the FIRST read: `startFrom` fires before the loop is ever entered, so it
  // needs its own guard rather than the `while` condition.
  it("does not announce a carried-over change once the subscriber has already gone", async () => {
    const onChanged = vi.fn();
    await pollDocument({
      stamp: async () => "changed",
      onChanged,
      keepGoing: () => false,
      sleep: async () => {},
      startFrom: "original",
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  // The subscriber can leave WHILE the poll is sleeping, and a publish then goes to a room
  // nobody is in. Asked again after the sleep for exactly that reason.
  it("does not announce a change it noticed after the last subscriber left", async () => {
    let watching = true;
    const onChanged = vi.fn();
    await pollDocument({
      stamp: async () => (watching ? "a" : "b"),
      onChanged,
      keepGoing: () => watching,
      sleep: async () => {
        watching = false;
      },
    });
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("resolveWatchableDocument", () => {
  /** Stands in for the host's containment gate: everything under /ws, nothing else. */
  const contain = (candidate: string): string | null => {
    const abs = path.isAbsolute(candidate) ? candidate : path.join(WORKSPACE, candidate);
    return abs.startsWith(WORKSPACE + path.sep) ? abs : null;
  };

  it("resolves a document the containment gate accepts", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:docs/a.md", SCOPES, contain)).toBe(path.join(WORKSPACE, "docs/a.md"));
  });

  // The channel name is a string a browser chose, so whatever the host refuses, this refuses.
  // Before #2147's review the check here was lexical and its own, which let a relative path
  // climb out through a symlink the gate would have caught.
  it("refuses whatever the containment gate refuses", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:../outside.md", SCOPES, contain)).toBeNull();
    expect(resolveWatchableDocument(`plugin:markdown:file:${path.resolve("/elsewhere/notes.md")}`, SCOPES, contain)).toBeNull();
  });

  // The scope gate runs FIRST, so a path the containment gate would happily accept is still
  // refused when no publish could ever reach that channel.
  it("refuses a scope nothing is published to, before containment is consulted", () => {
    const consulted = vi.fn(contain);
    expect(resolveWatchableDocument("plugin:sketch:file:docs/a.md", SCOPES, consulted)).toBeNull();
    expect(consulted).not.toHaveBeenCalled();
  });

  it("refuses a file the scope does not match", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:docs/a.txt", SCOPES, contain)).toBeNull();
  });

  it("matches a scope's files however they are capitalised", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:README.MD", SCOPES, contain)).toBe(path.join(WORKSPACE, "README.MD"));
  });

  // socket.io opens a room per socket id, and every other channel in the app is a room too —
  // all of them arrive here.
  it("refuses a channel that is not a file channel", () => {
    ["file-write", "A1b2C3d4", "plugin:mulmoScript:generation"].forEach((channel) => {
      expect(resolveWatchableDocument(channel, SCOPES, contain)).toBeNull();
    });
  });
});

/** A registry whose watchers park in `sleep` forever, so `watching` can be read without the
 *  loop racing the assertion. */
function parkedWatchers(resolve: (channel: string) => string | null) {
  return createDocumentWatchers({
    resolve,
    stamp: async () => "a",
    announce: () => {},
    sleep: () => new Promise<void>(() => {}),
  });
}

describe("createDocumentWatchers", () => {
  const resolvable = (channel: string) => (channel.startsWith("plugin:markdown:file:") ? "/ws/docs/a.md" : null);

  it("watches a document once a channel has a subscriber", () => {
    const watchers = parkedWatchers(resolvable);
    watchers.start("plugin:markdown:file:docs/a.md");
    expect(watchers.watching).toBe(1);
  });

  it("watches nothing for a channel that names no watchable document", () => {
    const watchers = parkedWatchers(resolvable);
    watchers.start("file-write");
    expect(watchers.watching).toBe(0);
  });

  // The room gains its first subscriber once, but a start is cheap to call and a second
  // watcher on one file would double every announcement.
  it("keeps one watcher per channel", () => {
    const watchers = parkedWatchers(resolvable);
    watchers.start("plugin:markdown:file:docs/a.md");
    watchers.start("plugin:markdown:file:docs/a.md");
    expect(watchers.watching).toBe(1);
  });

  it("stops watching when the last subscriber goes", () => {
    const watchers = parkedWatchers(resolvable);
    watchers.start("plugin:markdown:file:docs/a.md");
    watchers.stop("plugin:markdown:file:docs/a.md");
    expect(watchers.watching).toBe(0);
  });

  it("stops every watcher at shutdown", () => {
    const watchers = parkedWatchers(resolvable);
    watchers.start("plugin:markdown:file:docs/a.md");
    watchers.start("plugin:markdown:file:docs/b.md");
    watchers.stopAll();
    expect(watchers.watching).toBe(0);
  });

  // A room is free; a watcher is a stat every second. Without a ceiling a single page can turn
  // "subscribe to a channel" into unbounded work on the server (codex + CodeRabbit on #2147).
  it("stops watching new documents once the ceiling is reached", () => {
    const warn = vi.fn();
    const watchers = createDocumentWatchers({
      resolve: (channel) => `/ws/${channel}`,
      stamp: async () => "a",
      announce: () => {},
      sleep: () => new Promise<void>(() => {}),
      maxWatched: 3,
      warn,
    });
    ["a", "b", "c", "d"].forEach((name) => watchers.start(`plugin:markdown:file:${name}.md`));
    expect(watchers.watching).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    watchers.stopAll();
  });

  it("watches a document again once one is released", () => {
    const watchers = createDocumentWatchers({
      resolve: (channel) => `/ws/${channel}`,
      stamp: async () => "a",
      announce: () => {},
      sleep: () => new Promise<void>(() => {}),
      maxWatched: 1,
    });
    watchers.start("plugin:markdown:file:a.md");
    watchers.stop("plugin:markdown:file:a.md");
    watchers.start("plugin:markdown:file:b.md");
    expect(watchers.watching).toBe(1);
    watchers.stopAll();
  });

  it("has a ceiling by default", () => {
    expect(MAX_WATCHED_DOCUMENTS).toBeGreaterThan(0);
  });

  // The dropped-socket case, which is the one this whole change exists to remove: the last
  // subscriber goes, the file is rewritten while nobody watches, and the reconnecting view
  // would otherwise adopt the new content as its baseline and go on showing the old (codex on
  // #2147).
  it("announces a change that landed while nobody was watching", async () => {
    const announce = vi.fn();
    let stamp: FileStamp = "before";
    const watchers = createDocumentWatchers({
      resolve: () => "/ws/a.md",
      stamp: async () => stamp,
      announce,
      sleep: () => new Promise<void>(() => {}),
    });
    const channel = "plugin:markdown:file:a.md";
    watchers.start(channel);
    await vi.waitFor(() => expect(watchers.watching).toBe(1));
    watchers.stop(channel);
    stamp = "after";
    watchers.start(channel);
    await vi.waitFor(() => expect(announce).toHaveBeenCalledWith("a.md"));
    watchers.stopAll();
  });

  it("says nothing when the document is untouched while nobody is watching", async () => {
    const announce = vi.fn();
    const watchers = createDocumentWatchers({
      resolve: () => "/ws/a.md",
      stamp: async () => "same",
      announce,
      sleep: () => new Promise<void>(() => {}),
    });
    const channel = "plugin:markdown:file:a.md";
    watchers.start(channel);
    await vi.waitFor(() => expect(watchers.watching).toBe(1));
    watchers.stop(channel);
    watchers.start(channel);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(announce).not.toHaveBeenCalled();
    watchers.stopAll();
  });

  // Two Views may name one file differently — the pane holds an absolute path, a card may
  // carry a workspace-relative one — and each hears only the channel it subscribed to. An
  // announcement normalised to some other spelling would reach neither.
  it("announces on the channel's own spelling of the path", async () => {
    const announce = vi.fn();
    let stamp = "a";
    let ticked = false;
    const watchers = createDocumentWatchers({
      resolve: () => "/ws/docs/a.md",
      stamp: async () => stamp,
      announce,
      // One tick, then park. A sleep that kept resolving would spin the loop at full speed and
      // starve the assertion below of the turn it needs.
      sleep: () => {
        if (ticked) return new Promise<void>(() => {});
        ticked = true;
        stamp = "b";
        return Promise.resolve();
      },
    });
    watchers.start("plugin:markdown:file:/Users/x/docs/a.md");
    await vi.waitFor(() => expect(announce).toHaveBeenCalledWith("/Users/x/docs/a.md"));
    watchers.stopAll();
  });
});
