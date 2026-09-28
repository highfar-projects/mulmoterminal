// The next step a finished build hands to the new-build form: taken once, so the form opened again later starts empty.
import { describe, it, expect, vi } from "vitest";
import { router } from "../../../src/router";
import { blueprintsViewFollowUp, takeFollowUp } from "../../../src/composables/useBlueprintsView";

describe("a follow-up handed to the new-build form", () => {
  it("opens the form, is taken once, and is gone the next time", () => {
    const replace = vi.spyOn(router, "replace").mockResolvedValue(undefined);
    const followUp = { base: "docs", usecase: "write", answers: { style: "folder" }, projectDir: "/work/docs", after: "規約をつくる" };
    blueprintsViewFollowUp(followUp);
    expect(replace).toHaveBeenCalledWith(expect.objectContaining({ name: "blueprints" }));
    expect(takeFollowUp()).toEqual(followUp);
    expect(takeFollowUp()).toBeNull();
    replace.mockRestore();
  });
});
