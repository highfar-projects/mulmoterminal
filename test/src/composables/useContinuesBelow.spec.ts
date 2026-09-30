import { describe, it, expect } from "vitest";
import { continuesBelow } from "../../../src/composables/useContinuesBelow";

// #2615. Text below the fold of the code-block dialog's box is announced until the reader reaches it.
describe("continuesBelow", () => {
  it.each([
    ["text that fits", { scrollHeight: 300, clientHeight: 400, scrollTop: 0 }, false],
    ["text that fits exactly", { scrollHeight: 400, clientHeight: 400, scrollTop: 0 }, false],
    ["text past the fold", { scrollHeight: 1042, clientHeight: 398, scrollTop: 0 }, true],
    ["scrolled part way", { scrollHeight: 1042, clientHeight: 398, scrollTop: 300 }, true],
    ["scrolled to the end", { scrollHeight: 1042, clientHeight: 398, scrollTop: 644 }, false],
    ["a sub-pixel short of the end", { scrollHeight: 1042, clientHeight: 398, scrollTop: 643 }, false],
    ["nothing laid out yet", { scrollHeight: 0, clientHeight: 0, scrollTop: 0 }, false],
  ])("%s → %s", (_, box, expected) => {
    expect(continuesBelow(box)).toBe(expected);
  });
});
