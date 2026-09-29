import { describe, it, expect } from "vitest";
import { KEYMAP_ACTIONS } from "../../../common/keymap";
import { isFilesPaneAction } from "../../../src/components/filesPaneActions";

// The grid hands exactly these to TerminalGrid (#2267). An action missing here is a bound key that
// the grid claims and then does nothing with.
describe("isFilesPaneAction", () => {
  it("picks out the finder, the search and the three tab actions, and nothing else", () => {
    expect(KEYMAP_ACTIONS.filter(isFilesPaneAction)).toEqual(["files-find", "files-search", "files-tab-close", "files-tab-next", "files-tab-prev"]);
  });
});
