import { describe, it, expect, vi, afterEach } from "vitest";
import { applyKeymapPreset } from "../../../../src/components/settings/keymapPresetApi";

// #2581. What the panel is told for each answer from the server.
const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("applyKeymapPreset", () => {
  it("is saved, with the keymap as saved", async () => {
    answer(200, { keymap: { "zoom-toggle": "Alt+ArrowUp" } });
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "saved", keymap: { "zoom-toggle": "Alt+ArrowUp" } });
  });

  it("is changed, with the file's keymap, on a 409 that carries one", async () => {
    answer(409, { error: "the keymap changed", keymap: { "zoom-toggle": "F8" } });
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "changed", keymap: { "zoom-toggle": "F8" } });
  });

  // An answer without a keymap to adopt — a corrupt config's 409, a 500, a body that did not parse — is
  // a failure: adopting its missing keymap would empty this tab's shortcuts.
  it.each([
    [409, { error: "config.json is unreadable" }],
    [500, { error: "failed to persist config" }],
    [200, "not json"],
    [200, { keymap: "nope" }],
  ])("is failed for %i %j", async (status, body) => {
    answer(status, body);
    expect(await applyKeymapPreset("other", [])).toEqual({ status: "failed" });
  });
});
