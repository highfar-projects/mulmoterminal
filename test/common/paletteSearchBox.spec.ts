import { describe, it, expect } from "vitest";
import { PALETTE_SEARCH_BOX_DEFAULT, sanitizePaletteSearchBox } from "../../common/paletteSearchBox";

// #2569. Off unless the config says `true`: a box nobody asked for takes the bar's free space.
describe("sanitizePaletteSearchBox", () => {
  it("is off by default, and takes a boolean as written", () => {
    expect(PALETTE_SEARCH_BOX_DEFAULT).toBe(false);
    expect(sanitizePaletteSearchBox(true)).toBe(true);
    expect(sanitizePaletteSearchBox(false)).toBe(false);
  });

  it("reads anything else as unconfigured", () => {
    [undefined, null, "true", 1, {}].forEach((value) => expect(sanitizePaletteSearchBox(value)).toBe(false));
  });
});
