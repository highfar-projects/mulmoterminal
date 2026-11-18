// The helpers handed a session id alone ask the server that session runs on (common/peers.ts): the
// question pane's read and answer, a checklist's read and close.
import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("../../../src/composables/usePubSub", () => ({ usePubSub: () => ({ subscribe: () => () => {} }) }));

import { sessionHostOf, watchSessionHosts, peerReachable, peerIsDown } from "../../../src/composables/peerHosts";
import { lookUpOpenQuestion, postAnswer } from "../../../src/composables/openQuestion";
import { fetchOpenCheck, postCheckClosed } from "../../../src/composables/openCheck";
import PeerBadge from "../../../src/components/PeerBadge.vue";

const asked: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
});
const stub = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );

function withCells(cells: { session: string | null; host?: string }[]) {
  const list = ref(cells);
  mount(
    defineComponent({
      setup() {
        watchSessionHosts(() => list.value);
        return () => h("i");
      },
    }),
  );
  return list;
}

describe("the session-to-server map", () => {
  it("names a peer session's server, and nothing for this server's", async () => {
    const list = withCells([{ session: "s-peer", host: "win" }, { session: "s-here" }]);
    expect(sessionHostOf("s-peer")).toBe("win");
    expect(sessionHostOf("s-here")).toBeNull();
    list.value = [{ session: "s-here" }];
    await nextTick();
    expect(sessionHostOf("s-peer")).toBeNull();
  });

  it("sends a peer session's question and checklist requests to the peer", async () => {
    withCells([{ session: "s-peer", host: "win" }]);
    stub();
    await lookUpOpenQuestion("s-peer");
    await postAnswer("s-peer", "tool-1", [[0]]);
    await fetchOpenCheck("s-peer");
    await postCheckClosed("s-peer", "c1");
    expect(asked).toEqual([
      "/peer/win/api/question/s-peer",
      "/peer/win/api/question/s-peer/answer",
      "/peer/win/api/pane/check/s-peer",
      "/peer/win/api/pane/check/s-peer/close",
    ]);
  });
});

describe("PeerBadge", () => {
  it("says the peer is down only on a reported no", async () => {
    stub();
    const w = mount(PeerBadge, { props: { host: "win" }, global: { mocks: { t: (key: string) => key } } });
    expect(w.attributes("data-down")).toBeUndefined();
    peerReachable.value = new Map([["win", false]]);
    await nextTick();
    expect(peerIsDown("win")).toBe(true);
    expect(w.attributes("data-down")).toBe("true");
    expect(w.text()).toContain("cloud_off");
    peerReachable.value = new Map();
  });
});
