import { describe, it, expect } from "vitest";
import { NARROW_AMBIGUOUS_FAMILY } from "../../../common/terminalFontFamily";
import { withNarrowAmbiguous } from "../../../src/composables/terminalFontFamily";

// Personal-fork: the face that draws `①` one cell wide sits in front of every stack. That
// src/style.css declares it is pinned in test/scripts/style-narrow-ambiguous.spec.ts.
describe("withNarrowAmbiguous", () => {
  it("puts the narrow face ahead of the stack and leaves the stack as it was", () => {
    expect(withNarrowAmbiguous("'HackGen Console NF', monospace")).toBe(`${NARROW_AMBIGUOUS_FAMILY}, 'HackGen Console NF', monospace`);
  });
});
