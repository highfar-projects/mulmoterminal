import { describe, it, expect } from "vitest";
import { Text } from "@codemirror/state";
import { Chunk } from "@codemirror/merge";
import { changeMarks } from "../../../src/components/cmChangeMarks";

const lines = (...ls: string[]): Text => Text.of(ls);
const marks = (before: Text, after: Text) => changeMarks(Chunk.build(before, after), before, after);

// #2497. Which lines of the editor carry a change mark against HEAD, and of what kind.
describe("changeMarks", () => {
  const head = lines("one", "two", "three", "four");

  it("marks nothing for an unchanged file", () => {
    expect(marks(head, head)).toEqual([]);
  });

  it("marks new lines as added", () => {
    expect(marks(head, lines("one", "two", "new A", "new B", "three", "four"))).toEqual([
      { line: 3, kind: "added" },
      { line: 4, kind: "added" },
    ]);
  });

  it("marks a changed line as modified", () => {
    expect(marks(head, lines("one", "TWO", "three", "four"))).toEqual([{ line: 2, kind: "modified" }]);
  });

  // A deletion leaves no line to mark, so the mark goes on the line after the gap.
  it("marks the line after a removed one", () => {
    expect(marks(head, lines("one", "three", "four"))).toEqual([{ line: 2, kind: "deleted" }]);
  });

  it("marks the first line when the start was removed, and the last when the end was", () => {
    expect(marks(head, lines("two", "three", "four"))).toEqual([{ line: 1, kind: "deleted" }]);
    expect(marks(head, lines("one", "two", "three"))).toEqual([{ line: 3, kind: "deleted" }]);
  });

  it("marks several changes, each where it is", () => {
    expect(marks(head, lines("ONE", "two", "three", "four", "five"))).toEqual([
      { line: 1, kind: "modified" },
      { line: 5, kind: "added" },
    ]);
  });

  // A line appended at the end arrives in a chunk that also holds the line before it.
  it("marks only the appended line, not the one before it", () => {
    expect(marks(lines("one", "two"), lines("one", "two", "three"))).toEqual([{ line: 3, kind: "added" }]);
  });

  it("marks every line of an emptied file's one remaining line", () => {
    expect(marks(head, lines(""))).toEqual([{ line: 1, kind: "modified" }]);
  });
});
