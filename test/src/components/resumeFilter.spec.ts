import { describe, it, expect } from "vitest";

import { filterResumable } from "../../../src/components/resumeFilter";
import type { ResumableSession } from "../../../src/composables/useDirLists";

const row = (id: string, title: string): ResumableSession => ({ id, title, mtime: 1 });
const ROWS = [row("a", "Fix the login parser"), row("b", "Parser rewrite"), row("c", "ログイン修正"), row("d", "Add dark theme")];
const idsOf = (rows: ResumableSession[]): string[] => rows.map((r) => r.id);

describe("filterResumable", () => {
  it("keeps the whole list for a blank query", () => {
    expect(idsOf(filterResumable(ROWS, ""))).toEqual(["a", "b", "c", "d"]);
    expect(idsOf(filterResumable(ROWS, "   "))).toEqual(["a", "b", "c", "d"]);
  });

  it("matches a substring of the title, ignoring case", () => {
    expect(idsOf(filterResumable(ROWS, "PARSER"))).toEqual(["a", "b"]);
    expect(idsOf(filterResumable(ROWS, "dark"))).toEqual(["d"]);
  });

  it("needs every word, in any order", () => {
    expect(idsOf(filterResumable(ROWS, "parser login"))).toEqual(["a"]);
    expect(idsOf(filterResumable(ROWS, "login parser"))).toEqual(["a"]);
    expect(idsOf(filterResumable(ROWS, "parser dark"))).toEqual([]);
  });

  it("matches non-latin titles", () => {
    expect(idsOf(filterResumable(ROWS, "ログイン"))).toEqual(["c"]);
  });

  it("keeps the order of the list and never mutates it", () => {
    const copy = [...ROWS];
    expect(idsOf(filterResumable(ROWS, "r"))).toEqual(["a", "b", "d"]);
    expect(ROWS).toEqual(copy);
  });

  it("treats regular-expression characters as text", () => {
    expect(idsOf(filterResumable([row("x", "a.b (c)"), row("y", "axb")], "a.b"))).toEqual(["x"]);
    expect(idsOf(filterResumable(ROWS, "("))).toEqual([]);
  });
});
