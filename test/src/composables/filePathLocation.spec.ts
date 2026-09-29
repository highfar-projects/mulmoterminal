import { describe, it, expect } from "vitest";
import { locationAfterPath, locationFromQuery, locationQuery } from "../../../src/composables/filePathLocation";

// #2573. The shapes compilers, linters and agents print after a path.
describe("locationAfterPath", () => {
  it.each([
    [":42", { line: 42, col: null }, 3],
    [":42:7", { line: 42, col: 7 }, 5],
    [":42:7: error TS2345", { line: 42, col: 7 }, 5],
    [":42 some text", { line: 42, col: null }, 3],
    ["(12,5)", { line: 12, col: 5 }, 6],
    ["(12, 5): error", { line: 12, col: 5 }, 7],
    ["(12)", { line: 12, col: null }, 4],
    [":1234567", { line: 1234567, col: null }, 8],
  ])("reads %j", (rest, location, length) => {
    expect(locationAfterPath(rest)).toEqual({ location, length });
  });

  it("drops a column of 0 but keeps the line", () => {
    expect(locationAfterPath(":42:0")).toEqual({ location: { line: 42, col: null }, length: 5 });
  });

  it.each(["", " :42", ":", ":0", ":abc", ": 42", "(abc)", "(12,5", "(,5)", ":12345678", "(0,1)"])("finds none in %j", (rest) => {
    expect(locationAfterPath(rest)).toBeNull();
  });
});

describe("locationFromQuery", () => {
  it("reads a line and a column", () => {
    expect(locationFromQuery("42", "7")).toEqual({ line: 42, col: 7 });
    expect(locationFromQuery("42", null)).toEqual({ line: 42, col: null });
  });

  it.each([
    [null, "7"],
    ["0", null],
    ["-3", null],
    ["4.5", null],
    ["42abc", null],
    ["", null],
    ["12345678", null],
  ])("refuses line %j", (line, col) => {
    expect(locationFromQuery(line, col)).toBeNull();
  });

  it("drops a column that is not one, keeping the line", () => {
    expect(locationFromQuery("42", "x")).toEqual({ line: 42, col: null });
    expect(locationFromQuery("42", "0")).toEqual({ line: 42, col: null });
  });

  it("round-trips through locationQuery", () => {
    for (const location of [
      { line: 42, col: 7 },
      { line: 1, col: null },
    ]) {
      const query = locationQuery(location);
      expect(locationFromQuery(query.line ?? null, query.col ?? null)).toEqual(location);
    }
    expect(locationQuery(undefined)).toEqual({});
  });
});
