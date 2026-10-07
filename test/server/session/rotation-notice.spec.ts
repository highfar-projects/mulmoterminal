// @vitest-environment node
import { describe, it, expect } from "vitest";
import { movedNoticeLine, noteMovedFrom, takeMovedFrom } from "../../../server/session/rotation-notice";

const ID = "55555555-6666-4777-8888-999999999999";

describe("rotation notice (#2919)", () => {
  it("is taken once", () => {
    noteMovedFrom(ID, { fromLabel: "Personal", reason: "limit-hit" });
    expect(takeMovedFrom(ID)).toEqual({ fromLabel: "Personal", reason: "limit-hit" });
    expect(takeMovedFrom(ID)).toBeUndefined();
  });

  it("names both credentials on its own line", () => {
    const line = movedNoticeLine({ fromLabel: "Personal (me@example.com)", reason: "limit-hit" }, "Work");
    expect(line.startsWith("\r\n")).toBe(true);
    expect(line.endsWith("\r\n")).toBe(true);
    expect(line).toContain("Personal (me@example.com) reached its usage limit");
    expect(line).toContain("on Work.");
  });

  it("says when the move came before the limit rather than after it", () => {
    expect(movedNoticeLine({ fromLabel: "Personal", reason: "near-limit" }, "Work")).toContain("Personal is close to its usage limit");
  });
});
