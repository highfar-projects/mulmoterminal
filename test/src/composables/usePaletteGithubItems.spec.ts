import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const server = vi.hoisted(() => ({ asked: [] as string[], fail: false }));
vi.mock("../../../src/utils/fetchWithTimeout", () => ({
  SLOW_COMMAND_TIMEOUT_MS: 60000,
  fetchWithTimeout: async (path: string) => {
    server.asked.push(path);
    if (server.fail) return new Response("{}", { status: 500 });
    const repos =
      path === "/api/prs"
        ? [{ repo: "acme/app", prs: [{ number: 12, title: "Fix", url: "u12" }] }]
        : [{ repo: "acme/app", issues: [{ number: 34, title: "Slow", url: "u34" }] }];
    return new Response(JSON.stringify({ repos }));
  },
}));

const { usePaletteGithubItems, forgetGithubItems, GITHUB_ITEMS_MAX_AGE_MS } = await import("../../../src/composables/usePaletteGithubItems");

const mountItems = (offered: () => boolean) =>
  mount(
    defineComponent({
      setup() {
        const { items } = usePaletteGithubItems(offered);
        return () => h("div", items.value.map((item) => `${item.kind}${item.number}`).join(","));
      },
    }),
  );

beforeEach(() => {
  forgetGithubItems();
  server.asked.length = 0;
  server.fail = false;
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("usePaletteGithubItems", () => {
  it("asks nothing where the GitHub view is not offered", async () => {
    const w = mountItems(() => false);
    await flushPromises();
    expect(server.asked).toEqual([]);
    expect(w.text()).toBe("");
    w.unmount();
  });

  it("reads PRs and Issues once, and reuses the answer until it is too old", async () => {
    const first = mountItems(() => true);
    await flushPromises();
    expect(first.text()).toBe("pr12,issue34");
    first.unmount();
    const second = mountItems(() => true);
    await flushPromises();
    expect(second.text()).toBe("pr12,issue34");
    expect(server.asked).toEqual(["/api/prs", "/api/issues"]);
    second.unmount();
    vi.setSystemTime(Date.now() + GITHUB_ITEMS_MAX_AGE_MS);
    const later = mountItems(() => true);
    await flushPromises();
    expect(server.asked).toHaveLength(4);
    later.unmount();
  });

  it("lists nothing after a failed read, and asks again on the next opening", async () => {
    server.fail = true;
    const failed = mountItems(() => true);
    await flushPromises();
    expect(failed.text()).toBe("");
    failed.unmount();
    server.fail = false;
    const retried = mountItems(() => true);
    await flushPromises();
    expect(retried.text()).toBe("pr12,issue34");
    retried.unmount();
  });

  it("reads once the gate arrives after the palette opened", async () => {
    const offered = ref(false);
    const w = mountItems(() => offered.value);
    await flushPromises();
    expect(server.asked).toEqual([]);
    offered.value = true;
    await nextTick();
    await flushPromises();
    expect(w.text()).toBe("pr12,issue34");
    w.unmount();
  });
});
