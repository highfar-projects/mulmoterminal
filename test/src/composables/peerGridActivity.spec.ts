// useGridActivity with cells on a PEER server (common/peers.ts): each server is seeded and listened to
// for its own sessions, through this server's relay for a peer.
import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, ref, h, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

const subscribers = new Map<string, (data: unknown) => void>();
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: (host: string | null = null) => ({
    subscribe: (channel: string, handler: (data: unknown) => void) => {
      const key = `${host ?? ""}|${channel}`;
      subscribers.set(key, handler);
      return () => subscribers.delete(key);
    },
    onReconnect: () => () => {},
  }),
}));

import { useGridActivity } from "../../../src/composables/useGridActivity";
import type { CellActivity } from "../../../src/composables/sessionActivity";

const HERE = "11111111-1111-4111-8111-111111111111";
const THERE = "22222222-2222-4222-8222-222222222222";
const hostOf = (id: string) => (id === THERE ? "win" : null);

const asked: string[] = [];
function stubSeeds(byPath: Record<string, Record<string, unknown>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      const path = url.split("?")[0] ?? url;
      return { ok: true, json: async () => byPath[path] ?? {} };
    }),
  );
}

function mountGrid(ids: string[]) {
  let activity!: Map<string, CellActivity>;
  const sessionIds = ref(ids);
  mount(
    defineComponent({
      setup() {
        activity = useGridActivity(sessionIds, hostOf).activity;
        return () => h("div");
      },
    }),
  );
  return { get: () => activity, sessionIds };
}

afterEach(() => {
  vi.unstubAllGlobals();
  subscribers.clear();
  asked.length = 0;
});

describe("useGridActivity with a peer's cells", () => {
  it("seeds each session from the server it runs on", async () => {
    stubSeeds({
      "/api/activity": { [HERE]: { working: true, waiting: false, event: null } },
      "/peer/win/api/activity": { [THERE]: { working: false, waiting: true, event: null } },
    });
    const grid = mountGrid([HERE, THERE]);
    await flushPromises();
    expect(asked.sort()).toEqual([`/api/activity?ids=${HERE}`, `/peer/win/api/activity?ids=${THERE}`]);
    expect(grid.get().get(HERE)?.working).toBe(true);
    expect(grid.get().get(THERE)?.waiting).toBe(true);
  });

  it("listens to the peer's own stream while a cell runs there, and lets go after", async () => {
    stubSeeds({});
    const grid = mountGrid([HERE, THERE]);
    await flushPromises();
    expect(new Set(subscribers.keys())).toEqual(new Set(["|sessions", "win|sessions"]));

    subscribers.get("win|sessions")?.({ id: THERE, working: true, waiting: false, event: null });
    expect(grid.get().get(THERE)?.working).toBe(true);

    grid.sessionIds.value = [HERE];
    await nextTick();
    expect([...subscribers.keys()]).toEqual(["|sessions"]);
  });
});
