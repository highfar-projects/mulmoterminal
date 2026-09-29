import { describe, it, expect } from "vitest";
import { scopeOf } from "../../../src/composables/paletteScope";

// #2462. What a leading symbol means.
describe("scopeOf", () => {
  it("narrows to actions after > and to terminals after @, dropping the symbol and its spaces", () => {
    expect(scopeOf("> zoom")).toEqual({ help: false, only: "action", rest: "zoom" });
    expect(scopeOf("@term4")).toEqual({ help: false, only: "terminal", rest: "term4" });
  });

  it("hands file names to / and file contents to #", () => {
    expect(scopeOf("/ app.ts")).toEqual({ help: false, only: "file", rest: "app.ts" });
    expect(scopeOf("#TODO")).toEqual({ help: false, only: "content", rest: "TODO" });
  });

  it("asks for the list after ?", () => {
    expect(scopeOf("?")).toEqual({ help: true });
    expect(scopeOf("? anything")).toEqual({ help: true });
  });

  it("searches everything otherwise, a symbol later in the text included", () => {
    expect(scopeOf("zoom > next")).toEqual({ help: false, only: null, rest: "zoom > next" });
    expect(scopeOf("")).toEqual({ help: false, only: null, rest: "" });
  });
});
