import { describe, it, expect } from "vitest";
import { RIGHT_PANES } from "../../../src/components/gridCell";
import { NO_PANES, readStack, shownPane, withPaneOpened, withShownPaneClosed, type CellPanes } from "../../../src/components/rightPaneStack";

const opened = (...panes: (typeof RIGHT_PANES)[number][]): CellPanes => panes.reduce(withPaneOpened, NO_PANES);

describe("rightPaneStack", () => {
  it("shows the pane opened last, and closing it shows the one it covered", () => {
    const panes = opened("files", "transcript");
    expect(shownPane(panes)).toBe("transcript");
    expect(shownPane(withShownPaneClosed(panes))).toBe("files");
    expect(shownPane(withShownPaneClosed(withShownPaneClosed(panes)))).toBeNull();
  });

  it("moves a pane already in the stack to the top instead of adding it twice", () => {
    expect(opened("files", "transcript", "files").stack).toEqual(["transcript", "files"]);
    expect(opened("files", "files").stack).toEqual(["files"]);
  });

  it("never grows past one of each pane", () => {
    const every = [...RIGHT_PANES, ...RIGHT_PANES].reduce(withPaneOpened, NO_PANES);
    expect(every.stack).toHaveLength(RIGHT_PANES.length - 1); // the question pane is never stacked
    expect(new Set(every.stack).size).toBe(every.stack.length);
  });

  it("lays a question over the top pane, and answering it shows that pane again", () => {
    const asked = withPaneOpened(opened("files", "transcript"), "question");
    expect(shownPane(asked)).toBe("question");
    expect(asked.stack).toEqual(["files", "transcript"]);
    expect(withShownPaneClosed(asked)).toEqual({ stack: ["files", "transcript"], question: false });
    expect(shownPane(withPaneOpened(NO_PANES, "question"))).toBe("question");
    expect(shownPane(withShownPaneClosed(withPaneOpened(NO_PANES, "question")))).toBeNull();
  });

  it("lets a pane opened over a question take its place", () => {
    const asked = withPaneOpened(opened("files"), "question");
    expect(withPaneOpened(asked, "canvas")).toEqual({ stack: ["files", "canvas"], question: false });
    expect(withPaneOpened(asked, "files")).toEqual({ stack: ["files"], question: false });
  });

  it("closing with nothing open stays empty", () => {
    expect(withShownPaneClosed(NO_PANES)).toEqual(NO_PANES);
  });

  describe("readStack", () => {
    it("reads a stack, and the one pane remembered before stacks as a stack of one", () => {
      expect(readStack(["files", "transcript"])).toEqual(["files", "transcript"]);
      expect(readStack("prompts")).toEqual(["prompts"]);
    });

    it("drops the question pane, unknown names and repeats, keeping each pane's last place", () => {
      expect(readStack(["files", "question", "nope", 3, null, "canvas", "files"])).toEqual(["canvas", "files"]);
      expect(readStack("question")).toEqual([]);
    });

    it("reads anything else as nothing open", () => {
      [undefined, null, 1, {}, "", [], [[]]].forEach((value) => expect(readStack(value), String(value)).toEqual([]));
    });
  });
});
