// Which server a pane's requests go to (paneHost.ts), and the feed the Canvas and Tools panes read.
import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, ref, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

const subscribed: string[] = [];
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: (host: string | null = null) => ({
    subscribe: (channel: string) => {
      subscribed.push(`${host ?? ""}|${channel}`);
      return () => {};
    },
  }),
}));

import { providePaneHost, usePaneHost, usePaneDirKey } from "../../../src/composables/paneHost";
import { useSessionFeed } from "../../../src/composables/useSessionFeed";
import { fetchListing } from "../../../src/composables/useFilesTree";
import { previewSrcFor, rawFileSrc, previewTabUrl } from "../../../src/components/filesPreviewSrc";

const asked: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
  subscribed.length = 0;
});
const stub = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );

describe("usePaneHost", () => {
  it("is this server where nothing provides one — the full-screen view, a plain call", () => {
    expect(usePaneHost().value).toBeNull();
  });

  it("is what the grid provides, inside the pane", () => {
    let seen: string | null = "unset";
    const Child = defineComponent({
      setup() {
        seen = usePaneHost().value;
        return () => h("i");
      },
    });
    mount(
      defineComponent({
        setup() {
          providePaneHost(ref("win"));
          return () => h(Child);
        },
      }),
    );
    expect(seen).toBe("win");
  });
});

describe("a pane on a peer", () => {
  it("lists the peer's directory, decoding the key only where the request is built", async () => {
    stub({ entries: [] });
    const made: { key: (() => string | null) | null } = { key: null };
    const Child = defineComponent({
      setup() {
        made.key = usePaneDirKey(() => "/p");
        return () => h("i");
      },
    });
    mount(
      defineComponent({
        setup() {
          providePaneHost(ref("win"));
          return () => h(Child);
        },
      }),
    );
    if (!made.key) throw new Error("the child did not set up");
    await fetchListing(made.key(), "src");
    expect(asked).toEqual(["/peer/win/api/files/browse/list?cwd=%2Fp&path=src"]);
  });

  it("previews, shows and opens in a tab from the peer", () => {
    expect(previewSrcFor("table", "/p", "a.csv", null, null, { host: "win" })).toBe("/peer/win/api/files/browse/table?cwd=%2Fp&path=a.csv&embed=1");
    expect(previewSrcFor("html", "/p", "r.html", null, null, { host: "win" })).toBe("/peer/win/api/files/page/%2Fp/r.html");
    expect(rawFileSrc("/p", "a.png", null, "win")).toBe("/peer/win/api/files/raw?cwd=%2Fp&path=a.png");
    expect(previewTabUrl("markdown", "/p", "a.md", "win")).toBe("/peer/win/api/files/browse/md?cwd=%2Fp&path=a.md");
  });

  it("feeds the Canvas from the peer's history and the peer's channel", async () => {
    stub({ toolResults: [] });
    const items = ref<{ uuid: string }[]>([]);
    const host = ref<string | null>("win");
    mount(
      defineComponent({
        setup() {
          useSessionFeed(items, {
            sessionId: () => "s1",
            host: () => host.value,
            historyUrl: (id) => `/api/agent/toolResults/${id}`,
            historyKey: "toolResults",
            channel: (id) => `session:${id}`,
            identify: (r) => r.uuid,
            parse: (raw) => (raw as { uuid: string }) ?? null,
          });
          return () => h("i");
        },
      }),
    );
    await flushPromises();
    expect(asked).toEqual(["/peer/win/api/agent/toolResults/s1"]);
    expect(subscribed).toEqual(["win|session:s1"]);

    // Walked to a cell on this server: read again, from here.
    host.value = null;
    await nextTick();
    await flushPromises();
    expect(asked.at(-1)).toBe("/api/agent/toolResults/s1");
    expect(subscribed.at(-1)).toBe("|session:s1");
  });
});
