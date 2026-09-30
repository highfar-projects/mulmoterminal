import { describe, it, expect, afterEach, vi } from "vitest";
import type { ClosedCell } from "../../../src/composables/recentlyClosed";

const STORAGE_KEY = "mt-recently-closed";
const entry = (session: string): ClosedCell => ({ kind: "session", session, cwd: "/w", agent: "claude", account: null, title: session, closedAt: 1 });

// The module reads storage once on load, so each test loads it fresh.
const load = async () => {
  vi.resetModules();
  return import("../../../src/composables/useRecentlyClosed");
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useRecentlyClosed", () => {
  it("keeps a recorded cell for the next page load", async () => {
    (await load()).recordClosedCell(entry("a"));
    const reloaded = await load();
    expect(reloaded.recentlyClosed.value.map((closed) => closed.kind === "session" && closed.session)).toEqual(["a"]);
  });

  it("keeps what another tab recorded since this page loaded", async () => {
    const page = await load();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry("other-tab")]));
    page.recordClosedCell(entry("here"));
    expect(page.recentlyClosed.value.map((closed) => closed.kind === "session" && closed.session)).toEqual(["here", "other-tab"]);
  });

  it("forgets a reopened cell", async () => {
    const page = await load();
    page.recordClosedCell(entry("a"));
    page.recordClosedCell(entry("b"));
    page.forgetClosedCell(entry("a"));
    expect(page.recentlyClosed.value.map((closed) => closed.kind === "session" && closed.session)).toEqual(["b"]);
  });

  it("starts empty from a corrupt store", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect((await load()).recentlyClosed.value).toEqual([]);
  });

  it("still holds the list for this page when storage refuses writes", async () => {
    const page = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => page.recordClosedCell(entry("a"))).not.toThrow();
    expect(page.recentlyClosed.value).toHaveLength(1);
  });
});
