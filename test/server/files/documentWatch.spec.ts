// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { createDocumentWatchers, pollDocument, resolveWatchableDocument, type FileStamp, type WatchableScope } from "../../../server/files/documentWatch";

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
  it("resolves a workspace-relative document under the workspace", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:docs/a.md", WORKSPACE, SCOPES)).toBe(path.join(WORKSPACE, "docs/a.md"));
  });

  // presentDocument opens any `.md` on disk and deliberately has no containment root
  // (backends/openPath.ts), so refusing an absolute path would refuse to watch documents this
  // app itself opened.
  it("takes an absolute document as given", () => {
    const absolute = path.resolve("/elsewhere/notes/plan.md");
    expect(resolveWatchableDocument(`plugin:markdown:file:${absolute}`, WORKSPACE, SCOPES)).toBe(absolute);
  });

  it("refuses a relative path that climbs out of the workspace", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:../outside.md", WORKSPACE, SCOPES)).toBeNull();
  });

  // The test is "would a publish on this file reach this channel": a watcher for a scope
  // nothing forwards to could only ever stat a file and announce into the void.
  it("refuses a scope nothing is published to", () => {
    expect(resolveWatchableDocument("plugin:sketch:file:docs/a.md", WORKSPACE, SCOPES)).toBeNull();
  });

  it("refuses a file the scope does not match", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:docs/a.txt", WORKSPACE, SCOPES)).toBeNull();
  });

  it("matches a scope's files however they are capitalised", () => {
    expect(resolveWatchableDocument("plugin:markdown:file:README.MD", WORKSPACE, SCOPES)).toBe(path.join(WORKSPACE, "README.MD"));
  });

  // socket.io opens a room per socket id, and every other channel in the app is a room too —
  // all of them arrive here.
  it("refuses a channel that is not a file channel", () => {
    ["file-write", "A1b2C3d4", "plugin:mulmoScript:generation"].forEach((channel) => {
      expect(resolveWatchableDocument(channel, WORKSPACE, SCOPES)).toBeNull();
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
