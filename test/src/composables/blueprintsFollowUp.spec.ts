// The next step a finished build hands to the new-build form: taken once, so the form opened again later starts empty.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { router } from "../../../src/router";
import { blueprintsViewFollowUp, keepFormFill, takeFormFill } from "../../../src/composables/useBlueprintsView";

describe("a follow-up handed to the new-build form", () => {
  it("opens the form, is taken once, and is gone the next time", () => {
    const replace = vi.spyOn(router, "replace").mockResolvedValue(undefined);
    const followUp = { base: "docs", usecase: "write", answers: { style: "folder" }, projectDir: "/work/docs", after: "規約をつくる" };
    blueprintsViewFollowUp(followUp);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ name: "blueprints" }));
    expect(takeFormFill()).toEqual(followUp);
    expect(takeFormFill()).toBeNull();
    replace.mockRestore();
  });

  it("keeps a form as the person left it without opening the form, and gives it back once", () => {
    const replace = vi.spyOn(router, "replace").mockResolvedValue(undefined);
    const push = vi.spyOn(router, "push").mockResolvedValue(undefined);
    const fill = { base: "docs", usecase: "review", answers: { documents: "a.md" }, projectDir: "/work/new", preset: "itaku-keiyaku" };
    keepFormFill(fill);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(takeFormFill()).toEqual(fill);
    expect(takeFormFill()).toBeNull();
    replace.mockRestore();
    push.mockRestore();
  });
});

describe("a form kept across a reload", () => {
  const KEY = "blueprints.keptForm";
  const fill = { base: "docs", usecase: "review", answers: { documents: "a.md", maxFiles: 5 }, projectDir: "/work/new", preset: "itaku-keiyaku" };
  // A reload starts the module again with nothing in memory; this tab's sessionStorage is what survives it.
  const reloaded = async () => {
    vi.resetModules();
    return import("../../../src/composables/useBlueprintsView");
  };

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("gives back a kept form after a reload, once, and leaves nothing behind", async () => {
    keepFormFill(fill);
    const after = await reloaded();
    expect(after.takeFormFill()).toEqual(fill);
    expect(after.takeFormFill()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("drops a kept form older than the time a trust detour takes, and keeps one just inside it", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    keepFormFill(fill);
    const { KEPT_FORM_MAX_AGE_MS } = await import("../../../src/composables/useBlueprintsView");
    now.mockReturnValue(1_000_000 + KEPT_FORM_MAX_AGE_MS);
    const inTime = await reloaded();
    expect(inTime.takeFormFill()).toEqual(fill);
    now.mockReturnValue(1_000_000);
    keepFormFill(fill);
    now.mockReturnValue(1_000_000 + KEPT_FORM_MAX_AGE_MS + 1);
    const late = await reloaded();
    expect(late.takeFormFill()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    now.mockRestore();
  });

  it("ignores what is not a kept form, and a follow-up is never stored", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ keptAtMs: Date.now(), fill: { base: "docs" } }));
    expect((await reloaded()).takeFormFill()).toBeNull();
    sessionStorage.setItem(KEY, "{not json");
    expect((await reloaded()).takeFormFill()).toBeNull();
    const replace = vi.spyOn(router, "replace").mockResolvedValue(undefined);
    blueprintsViewFollowUp({ ...fill, after: "規約をつくる" });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    replace.mockRestore();
  });
});
