import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import type { UpdateStatus } from "../../../common/updateStatus";

/** jsdom reports "visible" by default; this is how a hidden tab is simulated. */
const setVisibility = (state: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { value: state, configurable: true });

afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility("visible");
});

const GIT_NOTICE = "Update available: a1b2c3d → origin  ·  run: git pull";
const POLL_MS = 3000;
const REFRESH_MS = 15 * 60_000;

const served = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  ready: true,
  install: "npm",
  version: "4.7.0",
  commit: null,
  latest: null,
  notice: null,
  ...over,
});

// The composable holds ONE status for the whole app — two components read it — so each case has
// to start from a fresh module graph, or it inherits the previous case's answer. That is also why
// the import lives in here rather than at module scope (vi.resetModules only affects later ones).
//
// Mounting a real component matters now that the slow re-read rides on usePollWhileVisible: its
// tick and its focus/visibility listeners are bound to a component's lifetime, so a bare call
// would exercise the fast poll and nothing else.
async function mountStatus() {
  vi.resetModules();
  const { useUpdateStatus } = await import("../../../src/composables/useUpdateStatus");
  let api!: ReturnType<typeof useUpdateStatus>;
  const mountConsumer = () =>
    mount(
      defineComponent({
        setup() {
          api = useUpdateStatus();
          return () => h("div");
        },
      }),
    );
  mountConsumer();
  return { badge: () => api.badge.value, status: () => api.status.value, mountConsumer };
}

describe("useUpdateStatus", () => {
  it("exposes a badge when the server reports a notice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => served({ notice: GIT_NOTICE }) })),
    );
    const { badge } = await mountStatus();
    await flushPromises();
    expect(badge()?.command).toBe("git pull");
  });

  it("has no badge when the server reports none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => served() })),
    );
    const { badge } = await mountStatus();
    await flushPromises();
    expect(badge()).toBeNull();
  });

  // What the Settings version line reads.
  it("exposes the running install", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => served({ install: "git", commit: "a1b2c3d" }) })),
    );
    const { status } = await mountStatus();
    await flushPromises();
    expect(status()).toMatchObject({ install: "git", version: "4.7.0", commit: "a1b2c3d" });
  });

  // The request may fail — badge and version line just stay hidden.
  it("stays hidden when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { badge, status } = await mountStatus();
    await flushPromises();
    expect(badge()).toBeNull();
    expect(status()).toBeNull();
  });

  // The server's check reaches the network (ls-remote can take seconds), so the first read is not
  // ready; a later poll must pick the notice up rather than give up on the first empty answer.
  it("shows the badge when the notice arrives on a later poll", async () => {
    vi.useFakeTimers();
    try {
      let body = served({ ready: false }); // the server check hasn't finished yet
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => body })),
      );
      const { badge } = await mountStatus();
      await vi.advanceTimersByTimeAsync(0);
      expect(badge()).toBeNull();

      body = served({ notice: GIT_NOTICE }); // the check finished behind
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(badge()?.command).toBe("git pull");
    } finally {
      vi.useRealTimers();
    }
  });

  // The point of #1821. A ready answer used to end the conversation, because it could not change
  // without a restart — and that is precisely why a server started with `npx mulmoterminal@latest`
  // never showed a badge: it is current at startup, and the server now re-checks while it runs.
  it("keeps re-reading after the answer has landed, so a later release is picked up", async () => {
    vi.useFakeTimers();
    try {
      let body = served(); // up to date at startup, which is what npx @latest always is
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }));
      vi.stubGlobal("fetch", fetchMock);
      const { badge } = await mountStatus();
      await vi.advanceTimersByTimeAsync(0);
      expect(badge()).toBeNull();
      expect(fetchMock.mock.calls).toHaveLength(1);

      body = served({ notice: GIT_NOTICE }); // a release shipped and the server's re-check saw it
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      expect(badge()?.command).toBe("git pull");
    } finally {
      vi.useRealTimers();
    }
  });

  // A backgrounded tab has nobody looking at the badge, so it must not keep asking.
  it("does not re-read while the tab is hidden", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => served() }));
      vi.stubGlobal("fetch", fetchMock);
      await mountStatus();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock.mock.calls).toHaveLength(1);

      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
      expect(fetchMock.mock.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // A server RESTART serves `ready: false` again until its own check lands. The slow tick alone
  // would leave the badge stale for a whole interval, so an unready read has to re-arm the fast
  // poll — the same chase that runs at startup.
  it("re-arms the fast poll when a later read comes back unready", async () => {
    vi.useFakeTimers();
    try {
      let body = served();
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }));
      vi.stubGlobal("fetch", fetchMock);
      const { badge } = await mountStatus();
      await vi.advanceTimersByTimeAsync(0);

      body = served({ ready: false }); // restarted; its check is still out on the network
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
      expect(badge()).toBeNull();

      body = served({ notice: GIT_NOTICE });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(badge()?.command).toBe("git pull");
    } finally {
      vi.useRealTimers();
    }
  });

  // A check that never lands must not hammer the endpoint forever — the fast chase stays bounded
  // even though the slow tick will eventually start another one.
  it("gives up the fast chase after a bounded number of unready reads", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => served({ ready: false }) }));
      vi.stubGlobal("fetch", fetchMock);
      await mountStatus();
      await vi.advanceTimersByTimeAsync(POLL_MS * 10);
      expect(fetchMock.mock.calls).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  // Opening Settings long after the chase gave up must ask again, not inherit the dead end.
  it("asks again when a later consumer appears and nothing has landed", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => ({ ok: true, json: async () => served({ ready: false }) }));
      vi.stubGlobal("fetch", fetchMock);
      const { mountConsumer } = await mountStatus();
      await vi.advanceTimersByTimeAsync(POLL_MS * 10);
      expect(fetchMock.mock.calls).toHaveLength(5);

      mountConsumer();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
