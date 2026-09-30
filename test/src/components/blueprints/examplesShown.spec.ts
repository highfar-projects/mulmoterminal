// @vitest-environment node
// The examples a group shows before it is opened: the first of each task, in the order given.
import { describe, it, expect } from "vitest";
import { firstOfEachUsecase } from "../../../../src/components/blueprints/blueprintView";

const example = (id: string, usecase: string) => ({ id, usecase });
const ids = (list: readonly { id: string }[]) => list.map((entry) => entry.id);

describe("firstOfEachUsecase", () => {
  it("shows the first example of each task and hides the rest, keeping their order", () => {
    const { shown, hidden } = firstOfEachUsecase([
      example("a1", "ask"),
      example("p1", "polish"),
      example("a2", "ask"),
      example("p2", "polish"),
      example("r1", "review"),
      example("p3", "polish"),
    ]);
    expect(ids(shown)).toEqual(["a1", "p1", "r1"]);
    expect(ids(hidden)).toEqual(["a2", "p2", "p3"]);
  });

  it("hides nothing when every task has one example", () => {
    const { shown, hidden } = firstOfEachUsecase([example("a1", "ask"), example("p1", "polish")]);
    expect(ids(shown)).toEqual(["a1", "p1"]);
    expect(hidden).toEqual([]);
  });

  it("shows one of a task that has only repeats", () => {
    const { shown, hidden } = firstOfEachUsecase([example("x1", "product"), example("x2", "product"), example("x3", "product")]);
    expect(ids(shown)).toEqual(["x1"]);
    expect(ids(hidden)).toEqual(["x2", "x3"]);
  });

  it("shows nothing for no examples", () => {
    expect(firstOfEachUsecase([])).toEqual({ shown: [], hidden: [] });
  });
});
