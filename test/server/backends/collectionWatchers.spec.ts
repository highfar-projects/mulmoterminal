// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The package is mocked: this spec is about WHICH roots the host mounts a generation for and
// how it recovers, not about the watcher itself (that is core's own suite). `vi.mock` is
// hoisted, so the module under test can be imported at the top like any other.
vi.mock("@mulmoclaude/core/collection-watchers", () => ({
  configureCollectionWatchers: vi.fn(),
  startCollectionWatchers: vi.fn(async () => {}),
  stopCollectionWatchers: vi.fn(async () => {}),
}));

import { configureCollectionWatchers, startCollectionWatchers, stopCollectionWatchers } from "@mulmoclaude/core/collection-watchers";
import {
  startCollectionCompletionWatchers,
  stopCollectionCompletionWatchers,
  syncCollectionWatcherRoots,
  watchedCollectionRootsForTesting,
} from "../../../server/backends/collectionWatchers.js";
import { initProjectRoots, resetProjectRootsForTesting } from "../../../server/infra/project-root.js";

const WORKSPACE = "/srv/ws";
let projects: Array<{ label: string; path: string }> = [];

const startedRoots = (): string[] => vi.mocked(startCollectionWatchers).mock.calls.map((call) => String(call[0]?.discoveryOpts?.workspaceRoot ?? ""));

beforeEach(() => {
  vi.mocked(configureCollectionWatchers).mockClear();
  vi.mocked(startCollectionWatchers).mockReset().mockResolvedValue(undefined);
  vi.mocked(stopCollectionWatchers).mockReset().mockResolvedValue(undefined);
  projects = [];
  initProjectRoots({ workspace: WORKSPACE, knownProjects: () => projects });
});

afterEach(async () => {
  await stopCollectionCompletionWatchers();
  resetProjectRootsForTesting();
});

describe("startCollectionCompletionWatchers", () => {
  it("mounts one generation per known project, workspace included, each with its root", async () => {
    projects = [
      { label: "mag2", path: "/srv/mag2" },
      { label: "site", path: "/srv/site" },
    ];
    await startCollectionCompletionWatchers();
    expect(configureCollectionWatchers).toHaveBeenCalledTimes(1);
    expect(startedRoots().sort()).toEqual(["/srv/mag2", "/srv/site", WORKSPACE]);
  });

  it("passes an EXPLICIT root on every start — the engine host would otherwise throw", async () => {
    await startCollectionCompletionWatchers();
    for (const call of vi.mocked(startCollectionWatchers).mock.calls) {
      expect(call[0]?.discoveryOpts?.workspaceRoot).toBeTruthy();
    }
  });
});

describe("syncCollectionWatcherRoots", () => {
  it("mounts a project recorded after boot, without restarting the ones already running", async () => {
    await startCollectionCompletionWatchers();
    expect(startedRoots()).toEqual([WORKSPACE]);

    projects = [{ label: "mag2", path: "/srv/mag2" }];
    await syncCollectionWatcherRoots();
    expect(startedRoots()).toEqual([WORKSPACE, "/srv/mag2"]);
  });

  it("releases exactly the root that left the list, by name", async () => {
    projects = [{ label: "mag2", path: "/srv/mag2" }];
    await startCollectionCompletionWatchers();

    projects = [];
    await syncCollectionWatcherRoots();
    // Scoped, not the bare form: a bare stop would take the workspace's generation down too.
    expect(stopCollectionWatchers).toHaveBeenCalledWith({ workspaceRoot: "/srv/mag2" });
    expect(watchedCollectionRootsForTesting()).toEqual([WORKSPACE]);
  });

  it("treats two spellings of one directory as one root", async () => {
    projects = [{ label: "mag2", path: "/srv/mag2/" }];
    await startCollectionCompletionWatchers();
    projects = [{ label: "mag2", path: "/srv/mag2/./" }];
    await syncCollectionWatcherRoots();
    expect(startedRoots()).toEqual([WORKSPACE, "/srv/mag2"]);
  });

  it("keeps the other roots when one fails, and retries it on the next pass", async () => {
    projects = [
      { label: "gone", path: "/srv/gone" },
      { label: "mag2", path: "/srv/mag2" },
    ];
    vi.mocked(startCollectionWatchers).mockImplementation(async (opts) => {
      if (opts?.discoveryOpts?.workspaceRoot === "/srv/gone") throw new Error("ENOENT");
    });
    await startCollectionCompletionWatchers();
    // The failure did not stop the loop: the roots after it are watched.
    expect(watchedCollectionRootsForTesting().sort()).toEqual(["/srv/mag2", WORKSPACE]);

    vi.mocked(startCollectionWatchers).mockResolvedValue(undefined);
    await syncCollectionWatcherRoots();
    expect(watchedCollectionRootsForTesting().sort()).toEqual(["/srv/gone", "/srv/mag2", WORKSPACE]);
  });

  it("does not re-mount a root that is already running", async () => {
    await startCollectionCompletionWatchers();
    await syncCollectionWatcherRoots();
    await syncCollectionWatcherRoots();
    expect(startedRoots()).toEqual([WORKSPACE]);
  });

  it("serialises overlapping passes rather than dropping the later one", async () => {
    await startCollectionCompletionWatchers();
    // The first pass is held INSIDE its start, so it has provably already read the project list
    // before the second pass is queued. Without the gate both passes read the list after it was
    // widened, and an implementation that simply DROPPED the second pass would pass this test.
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inFlight = new Promise<void>((resolve) => (entered = resolve));
    vi.mocked(startCollectionWatchers).mockImplementationOnce(async () => {
      entered();
      await gate;
    });

    projects = [{ label: "mag2", path: "/srv/mag2" }];
    const first = syncCollectionWatcherRoots();
    await inFlight;

    projects = [
      { label: "mag2", path: "/srv/mag2" },
      { label: "site", path: "/srv/site" },
    ];
    const second = syncCollectionWatcherRoots();
    release();
    await Promise.all([first, second]);
    expect(watchedCollectionRootsForTesting().sort()).toEqual(["/srv/mag2", "/srv/site", WORKSPACE]);
  });

  // The package deletes its generation on the LAST line of its stop, so a throw can leave one
  // alive. Forgetting the root here would forget the only handle a later pass could retry with,
  // and the project would keep watching files and publishing bells forever.
  it("keeps a root tracked when its stop fails, and retries the stop next pass", async () => {
    projects = [{ label: "mag2", path: "/srv/mag2" }];
    await startCollectionCompletionWatchers();

    vi.mocked(stopCollectionWatchers).mockRejectedValueOnce(new Error("EBUSY"));
    projects = [];
    await syncCollectionWatcherRoots();
    expect(watchedCollectionRootsForTesting().sort()).toEqual(["/srv/mag2", WORKSPACE]);

    await syncCollectionWatcherRoots();
    expect(vi.mocked(stopCollectionWatchers)).toHaveBeenCalledTimes(2);
    expect(watchedCollectionRootsForTesting()).toEqual([WORKSPACE]);
  });

  it("does not re-mount a root whose stop failed — it is still watching", async () => {
    projects = [{ label: "mag2", path: "/srv/mag2" }];
    await startCollectionCompletionWatchers();
    const startsAfterBoot = vi.mocked(startCollectionWatchers).mock.calls.length;

    vi.mocked(stopCollectionWatchers).mockRejectedValue(new Error("EBUSY"));
    projects = [];
    await syncCollectionWatcherRoots();
    // Back on the list before the stop ever succeeded: the generation never went away, so
    // starting it again would be mounting a second one over a live tree.
    projects = [{ label: "mag2", path: "/srv/mag2" }];
    await syncCollectionWatcherRoots();
    expect(vi.mocked(startCollectionWatchers).mock.calls).toHaveLength(startsAfterBoot);
    // The teardown stops everything through the same mock, so leave it able to succeed.
    vi.mocked(stopCollectionWatchers).mockResolvedValue(undefined);
  });
});
