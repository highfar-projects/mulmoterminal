import { describe, it, expect } from "vitest";
import { isWritableKey, rowActions, toggledFavorites } from "../../../src/composables/paletteRowActions";

describe("rowActions", () => {
  it("offers run, a favorite toggle and the key for a row whose key may be written", () => {
    expect(rowActions({ kind: "screen", disabledReason: null }, "screen:wiki", []).map((action) => action.id)).toEqual(["run", "favorite-add", "copy-key"]);
    expect(rowActions({ kind: "screen", disabledReason: null }, "screen:wiki", ["screen:wiki"]).map((action) => action.id)).toEqual([
      "run",
      "favorite-remove",
      "copy-key",
    ]);
  });

  it("offers only run for a row whose key names something else next time", () => {
    ["terminal", "prompt", "handoff"].forEach((kind) =>
      expect(rowActions({ kind, disabledReason: null }, "k", []).map((action) => action.id)).toEqual(["run"]),
    );
    expect(rowActions({ kind: "start", disabledReason: null, start: { kind: "launcher" } }, "k", []).map((action) => action.id)).toEqual(["run"]);
  });

  it("disables run with the row's own reason, and nothing else", () => {
    const [run, favorite] = rowActions({ kind: "action", disabledReason: "needs enlarged" }, "zoom-next", []);
    expect(run?.disabledReason).toBe("needs enlarged");
    expect(favorite?.disabledReason).toBeNull();
  });
});

describe("isWritableKey", () => {
  it("is the skill's table: stable kinds, and an agent start but not a launcher", () => {
    const writable = ["action", "screen", "settings", "choice", "launch", "command", "collection", "resume", "wiki", "github"];
    expect(writable.every((kind) => isWritableKey({ kind }))).toBe(true);
    expect(isWritableKey({ kind: "start", start: { kind: "agent" } })).toBe(true);
    expect(["terminal", "prompt", "handoff", "prefix", "new-kind"].some((kind) => isWritableKey({ kind }))).toBe(false);
  });
});

describe("toggledFavorites", () => {
  it("adds a key at the end, or takes it out", () => {
    expect(toggledFavorites(["a"], "b")).toEqual(["a", "b"]);
    expect(toggledFavorites(["a", "b"], "a")).toEqual(["b"]);
  });
});
