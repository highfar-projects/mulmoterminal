import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, ref, h, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

import { useGitStatus } from "../../../src/composables/useGitStatus";
import type { GitStatus } from "../../../common/gitStatus";

const REPO: GitStatus = { repo: true, branch: "main", detached: false, dirty: 2, ahead: 0, behind: 0, upstream: true };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function mountGit(initialCwd: string | null) {
  const cwd = ref<string | null>(initialCwd);
  let status!: ReturnType<typeof useGitStatus>["status"];
  const wrapper = mount(
    defineComponent({
      setup() {
        status = useGitStatus(cwd).status;
        return () => h("div");
      },
    }),
  );
  return { wrapper, cwd, get: () => status.value };
}

afterEach(() => vi.unstubAllGlobals());

describe("useGitStatus", () => {
  it("applies the fetched status for the current dir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => REPO })),
    );
    const { get } = mountGit("/repo");
    await flushPromises();
    expect(get()).toEqual(REPO);
  });

  // The #620 shape, on the dir→null edge: a launcher/command cell has no dir, and switching
  // to it while a status fetch for the previous dir is still out must not let that late
  // response repaint the old branch chip. The token has to advance on the null branch too.
  it("drops an in-flight response for a dir the cell has since left", async () => {
    const gate = deferred<boolean>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate.promise;
        return { ok: true, json: async () => REPO };
      }),
    );
    const { cwd, get } = mountGit("/repo"); // mount starts the /repo fetch, held on the gate

    cwd.value = null; // switch to a dir-less cell: status clears synchronously
    await nextTick();
    await flushPromises();
    expect(get()).toBeNull();

    gate.resolve(true); // the stale /repo response finally lands
    await flushPromises();
    expect(get()).toBeNull(); // and must be ignored, not revive the old branch
  });
});

// #2164. The server answer costs four git processes over the whole worktree, so on a busy
// machine a read outlives POLL_MS. A tick that fires anyway stacks reads that then slow each
// other down — the pileup that saturated a 20-core machine.
describe("useGitStatus — the poll does not stack", () => {
  function mountGitWithRefresh(initialCwd: string | null) {
    const cwd = ref<string | null>(initialCwd);
    let api!: ReturnType<typeof useGitStatus>;
    mount(
      defineComponent({
        setup() {
          api = useGitStatus(cwd);
          return () => h("div");
        },
      }),
    );
    return { cwd, refresh: () => api.refresh() };
  }

  /** A fetch that never answers, so every call stays in flight for the whole test. */
  function stubHangingFetch() {
    const fetchMock = vi.fn(() => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => vi.useRealTimers());

  it("skips ticks while a read is still in flight", async () => {
    vi.useFakeTimers();
    const fetchMock = stubHangingFetch();
    mountGitWithRefresh("/repo"); // the mount read starts and never finishes
    await vi.advanceTimersByTimeAsync(10_000 * 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still reads when the cell moves to a different dir", async () => {
    const fetchMock = stubHangingFetch();
    const { cwd } = mountGitWithRefresh("/repo");

    cwd.value = "/other"; // a different question, not a repeat of the one in flight
    await nextTick();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still reads when a caller asks explicitly", async () => {
    const fetchMock = stubHangingFetch();
    const { refresh } = mountGitWithRefresh("/repo");

    void refresh(); // the forced update after a turn finishes

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes polling once the read finishes", async () => {
    vi.useFakeTimers();
    const gate = deferred<boolean>();
    const fetchMock = vi.fn(async () => {
      await gate.promise;
      return { ok: true, json: async () => REPO };
    });
    vi.stubGlobal("fetch", fetchMock);
    mountGitWithRefresh("/repo");

    await vi.advanceTimersByTimeAsync(10_000 * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1); // held open: every tick skipped

    gate.resolve(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2); // free again: the next tick reads
  });
});
