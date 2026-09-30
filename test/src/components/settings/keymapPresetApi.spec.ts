import { describe, it, expect, vi, afterEach } from "vitest";
import { applyKeymapPreset, fetchPresetReserved } from "../../../../src/components/settings/keymapPresetApi";

// #2581. What the panel is told for each answer from the server.
const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("applyKeymapPreset", () => {
  it("is saved, with the keymap as saved", async () => {
    answer(200, { keymap: { "zoom-toggle": "Alt+ArrowUp" }, reserved: ["Ctrl+j"] });
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "saved", keymap: { "zoom-toggle": "Alt+ArrowUp" }, reserved: ["Ctrl+j"] });
  });

  it("is changed, with the file's keymap, on a 409 that carries one", async () => {
    answer(409, { error: "the keymap changed", keymap: { "zoom-toggle": "F8" } });
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "changed", keymap: { "zoom-toggle": "F8" }, reserved: [] });
  });

  // An answer without a keymap to adopt — a corrupt config's 409, a 500, a body that did not parse — is
  // a failure: adopting its missing keymap would empty this tab's shortcuts.
  it.each([
    [409, { error: "config.json is unreadable" }],
    [500, { error: "failed to persist config" }],
    [200, "not json"],
    [200, { keymap: "nope" }],
    [400, { error: "expected must be the list of changes shown" }],
  ])("is failed for %i %j", async (status, body) => {
    answer(status, body);
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "failed" });
  });

  // #2693. A network that fails outright, or never answers, is a failure too — and never a throw, which
  // would leave the panel saying "saving" for good.
  it("is failed when the request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "failed" });
  });

  it("is failed when the server never answers", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
        ),
      );
      const pending = applyKeymapPreset("other", []);
      await vi.runAllTimersAsync();
      expect(await pending).toEqual({ status: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchPresetReserved", () => {
  it("reads the keys the file's unknown entries hold", async () => {
    answer(200, { reserved: ["Ctrl+j", 7, "Alt+x"] });
    expect(await fetchPresetReserved()).toEqual(["Ctrl+j", "Alt+x"]);
  });

  it.each([
    [500, { error: "boom" }],
    [200, "not json"],
    [200, { reserved: "Ctrl+j" }],
  ])("has none for %i %j", async (status, body) => {
    answer(status, body);
    expect(await fetchPresetReserved()).toEqual([]);
  });
});
