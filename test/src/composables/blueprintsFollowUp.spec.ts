// The next step a finished build hands to the new-build form: taken once, so the form opened again later starts empty.
import { describe, it, expect, vi } from "vitest";
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
