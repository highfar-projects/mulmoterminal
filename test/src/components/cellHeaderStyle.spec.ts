import { describe, it, expect } from "vitest";
import { headerStyleFor, cellStyleFor, terminalHeaderStyleFor } from "../../../src/components/cellHeaderStyle.js";

describe("headerStyleFor", () => {
  it("maps a background + text color to the header CSS variables", () => {
    expect(headerStyleFor("#ff2e63", "#ffffff", true)).toEqual({
      "--cell-header-bg": "#ff2e63",
      "--cell-header-fg": "#ffffff",
    });
  });

  it("emits only the variable that is set", () => {
    expect(headerStyleFor("#123456", null, false)).toEqual({ "--cell-header-bg": "#123456" });
    expect(headerStyleFor(null, "#abcdef", true)).toEqual({ "--cell-header-fg": "#abcdef" });
  });

  it("returns an empty style when nothing is configured", () => {
    expect(headerStyleFor(null, undefined, true)).toEqual({});
  });

  it("drops non-hex values so garbage can't reach the inline style", () => {
    expect(headerStyleFor("red", "rgb(1,2,3)", true)).toEqual({});
    expect(headerStyleFor("#fff", "#12345", true)).toEqual({}); // wrong length — and #fff is not a colour here either
    expect(headerStyleFor("javascript:alert(1)", "#000000", true)).toEqual({ "--cell-header-fg": "#000000" });
  });

  // A directory that declares `headerColor` and no `headerTextColor` is the issue's own
  // reproduction (#1591): without a derived ink the text keeps a colour chosen for the theme's
  // panel, which on a saturated header is the background. The values come from
  // common/chromeFromColor.ts, so a derived cell header and a repo.json-derived one agree.
  it("derives the text colour from the background when the directory declared none", () => {
    expect(headerStyleFor("#241640", null, true)).toEqual({ "--cell-header-bg": "#241640", "--cell-header-fg": "#ffffff" });
    expect(headerStyleFor("#ffe8a3", null, true)).toEqual({ "--cell-header-bg": "#ffe8a3", "--cell-header-fg": "#1b2430" });
    // The issue's own colour, and it goes DARK: #e8341c scores 4.92:1 against black and 4.27:1
    // against white, so the rule that reads the background beats the eye's guess that a strong red
    // wants white on it.
    expect(headerStyleFor("#e8341c", null, true)).toEqual({ "--cell-header-bg": "#e8341c", "--cell-header-fg": "#1b2430" });
  });

  it("prefers the declared text colour over the derived one", () => {
    expect(headerStyleFor("#e8341c", "#101010", true)).toEqual({ "--cell-header-bg": "#e8341c", "--cell-header-fg": "#101010" });
  });

  // The derived ink is only readable against the background it was derived from. A working / done /
  // blocked cell paints its own header background, so there is nothing to derive against — and a
  // declared colour still applies, exactly as it did before, since that is the user's own choice.
  it("derives nothing while the directory's background is not what shows", () => {
    expect(headerStyleFor("#e8341c", null, false)).toEqual({ "--cell-header-bg": "#e8341c" });
    expect(headerStyleFor("#e8341c", "#101010", false)).toEqual({ "--cell-header-bg": "#e8341c", "--cell-header-fg": "#101010" });
  });
});

describe("cellStyleFor", () => {
  it("maps body / border / dot / button colors to the cell CSS variables", () => {
    expect(cellStyleFor("#101014", "#2a2a4e", "#00e676", "#c7cdf0")).toEqual({
      "--cell-bg": "#101014",
      "--cell-border": "#2a2a4e",
      "--cell-dot": "#00e676",
      "--cell-btn": "#c7cdf0",
    });
  });

  it("emits only the variables that are set", () => {
    expect(cellStyleFor(null, "#2a2a4e", null, null)).toEqual({ "--cell-border": "#2a2a4e" });
    expect(cellStyleFor("#101014", null, null, null)).toEqual({ "--cell-bg": "#101014" });
  });

  it("returns an empty style when nothing is configured", () => {
    expect(cellStyleFor(null, undefined, null, undefined)).toEqual({});
  });

  it("drops non-hex values", () => {
    expect(cellStyleFor("blue", "#12", "rgb(0,0,0)", "#abcdef")).toEqual({ "--cell-btn": "#abcdef" });
  });
});

describe("terminalHeaderStyleFor", () => {
  it("reuses the header bg/fg vars and adds the button var", () => {
    expect(terminalHeaderStyleFor("#241640", "#ffd166", "#4dd0e1")).toEqual({
      "--cell-header-bg": "#241640",
      "--cell-header-fg": "#ffd166",
      "--cell-btn": "#4dd0e1",
    });
  });

  it("emits only the set + valid vars", () => {
    expect(terminalHeaderStyleFor("#241640", null, "nope")).toEqual({ "--cell-header-bg": "#241640", "--cell-header-fg": "#ffffff" });
    expect(terminalHeaderStyleFor(null, null, null)).toEqual({});
  });

  // This row keeps the directory's background whatever the session is doing, so it always derives.
  it("derives the text colour too, since no status replaces this row's background", () => {
    expect(terminalHeaderStyleFor("#ffe8a3", null, null)).toEqual({ "--cell-header-bg": "#ffe8a3", "--cell-header-fg": "#1b2430" });
  });
});
