import { describe, it, expect, vi } from "vitest";

const STORAGE_KEY = "copyModeBanner";

// The startup value is read once at module load, so each case needs a fresh module.
const loadComposable = async (stored: string | null) => {
  localStorage.clear();
  if (stored !== null) localStorage.setItem(STORAGE_KEY, stored);
  vi.resetModules();
  return (await import("../../../src/composables/useCopyModeBanner")).useCopyModeBanner();
};

describe("useCopyModeBanner startup value", () => {
  it("shows the banner when nothing is stored", async () => {
    expect((await loadComposable(null)).copyModeBanner.value).toBe(true);
  });

  it("hides it only for the exact string 0", async () => {
    expect((await loadComposable("0")).copyModeBanner.value).toBe(false);
  });

  it.each(["1", "", "false", "off", "garbage"])("keeps the banner for stored %j", async (stored) => {
    expect((await loadComposable(stored)).copyModeBanner.value).toBe(true);
  });
});

describe("useCopyModeBanner setter", () => {
  it("persists the choice in both directions", async () => {
    const { copyModeBanner, setCopyModeBanner } = await loadComposable(null);
    setCopyModeBanner(false);
    expect(copyModeBanner.value).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("0");
    setCopyModeBanner(true);
    expect(copyModeBanner.value).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("still applies for the session when storage throws", async () => {
    const { copyModeBanner, setCopyModeBanner } = await loadComposable(null);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setCopyModeBanner(false);
    spy.mockRestore();
    expect(copyModeBanner.value).toBe(false);
  });

  it("falls back to showing when storage cannot be read", async () => {
    localStorage.clear();
    vi.resetModules();
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { copyModeBanner } = (await import("../../../src/composables/useCopyModeBanner")).useCopyModeBanner();
    spy.mockRestore();
    expect(copyModeBanner.value).toBe(true);
  });
});
