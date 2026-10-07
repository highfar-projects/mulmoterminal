// @vitest-environment node
import { describe, it, expect } from "vitest";
import { movedNoticeLine, noteMovedFrom, takeMovedFrom } from "../../../server/session/rotation-notice";

const ID = "55555555-6666-4777-8888-999999999999";

describe("rotation notice (#2919)", () => {
  it("is taken once", () => {
    noteMovedFrom(ID, "Personal");
    expect(takeMovedFrom(ID)).toBe("Personal");
    expect(takeMovedFrom(ID)).toBeUndefined();
  });

  it("names both credentials on its own line", () => {
    const line = movedNoticeLine("Personal (me@example.com)", "Work");
    expect(line.startsWith("\r\n")).toBe(true);
    expect(line.endsWith("\r\n")).toBe(true);
    expect(line).toContain("Personal (me@example.com) reached its usage limit");
    expect(line).toContain("on Work.");
  });
});
