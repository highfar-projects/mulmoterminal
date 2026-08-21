import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

import QuitSection from "../../../../src/components/settings/QuitSection.vue";

// Mocked rather than read back: the real one is a module-level, ONE-WAY flag (nothing can clear it,
// because there is no server left to say otherwise), so a test that set it would decide the answer
// for every test after it in this file.
const { markServerStopped } = vi.hoisted(() => ({ markServerStopped: vi.fn() }));
vi.mock("../../../../src/composables/useServerStopped", () => ({ markServerStopped }));

// The one control in this app that takes everything else away (#1820), so what is pinned here is
// that it CANNOT be reached in a single click, and that the page is only declared stopped when the
// server actually said so.
const respond = (ok: boolean) => {
  globalThis.fetch = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ stopping: ok }) })) as unknown as typeof fetch;
};

const calls = (): { url: string; method: string | undefined }[] =>
  (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => ({
    url: String(c[0]),
    method: (c[1] as RequestInit | undefined)?.method,
  }));

beforeEach(() => {
  vi.restoreAllMocks();
  markServerStopped.mockClear();
  respond(true);
});

describe("the quit section", () => {
  it("does not stop anything on the first click — it asks first", async () => {
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    await flushPromises();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(w.find('[data-testid="quit-confirm"]').exists()).toBe(true);
  });

  it("says what happens to the running sessions, which a browser confirm has no room for", async () => {
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    // Not the exact words — that they are SHOWN. The wording is i18n's to own; its absence is a
    // user pressing a destructive button without being told the one thing they would ask.
    expect(w.get('[data-testid="quit-confirm"]').text().length).toBeGreaterThan(0);
    expect(w.findAll('[data-testid="quit-confirm"] p')).toHaveLength(2);
  });

  it("backs out without asking the server anything", async () => {
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    await w.get('[data-testid="quit-cancel"]').trigger("click");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(w.find('[data-testid="quit-server"]').exists()).toBe(true);
  });

  it("posts to the path MulmoClaude uses, so both hosts stop the same way", async () => {
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    await w.get('[data-testid="quit-confirm-yes"]').trigger("click");
    await flushPromises();
    expect(calls()).toEqual([{ url: "/api/shutdown", method: "POST" }]);
    // Only now, on the server's own acknowledgement — the page is not declared dead on a click.
    expect(markServerStopped).toHaveBeenCalledTimes(1);
  });

  it("leaves the page usable when the server refused, rather than claiming it stopped", async () => {
    respond(false);
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    await w.get('[data-testid="quit-confirm-yes"]').trigger("click");
    await flushPromises();
    expect(markServerStopped).not.toHaveBeenCalled();
    expect(w.find('[data-testid="quit-failed"]').exists()).toBe(true);
    // Back to the un-armed state: the next attempt has to pass the confirmation again.
    expect(w.find('[data-testid="quit-server"]').exists()).toBe(true);
  });

  it("cannot fire twice from a double click", async () => {
    const w = mount(QuitSection);
    await w.get('[data-testid="quit-server"]').trigger("click");
    const confirm = w.get('[data-testid="quit-confirm-yes"]');
    await confirm.trigger("click");
    await confirm.trigger("click");
    await flushPromises();
    expect(calls()).toHaveLength(1);
  });
});
