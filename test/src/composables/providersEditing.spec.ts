// #2621. A backend change re-asks /api/launch-options — what the list and the picker show — only once
// the server took it, and carries the problem word when it did not.
import { describe, it, expect, vi, beforeEach } from "vitest";

const reloads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../src/composables/useLaunchOptions", () => ({
  reloadLaunchOptions: async () => {
    reloads.count += 1;
  },
}));

const { changeProviders } = await import("../../../src/composables/providersEditing");

const answering = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

beforeEach(() => {
  reloads.count = 0;
});

describe("changeProviders", () => {
  it("re-asks for the launch options after a change the server took", async () => {
    globalThis.fetch = answering(200, { providers: [] });
    expect((await changeProviders("add", { label: "x" })).ok).toBe(true);
    expect(reloads.count).toBe(1);
  });

  it("does not, and names the problem, when the server refused", async () => {
    globalThis.fetch = answering(409, { error: "baseUrlV1" });
    expect(await changeProviders("add", { label: "x" })).toEqual({ ok: false, problem: "baseUrlV1" });
    expect(reloads.count).toBe(0);
  });

  it("leaves an error it does not know as no problem word", async () => {
    globalThis.fetch = answering(409, { error: "config.json is unreadable" });
    expect(await changeProviders("remove", { id: "x" })).toEqual({ ok: false, problem: null });
  });
});
