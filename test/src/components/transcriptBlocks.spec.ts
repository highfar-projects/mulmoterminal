import { describe, it, expect } from "vitest";
import { groupTurnRows, toolBlockLabel } from "../../../src/components/transcriptBlocks";
import type { TranscriptRow } from "../../../common/transcriptView";

// #2112. A turn arrives as a flat list of rows and is DRAWN as frames, one per speaker run. What
// matters here is that a run is a run: a turn that alternates several times must not collapse into
// "one user frame and one agent frame", and two adjacent rows from the same speaker must not become
// two frames with one line in each.
const row = (kind: TranscriptRow["kind"], text: string, over: Partial<TranscriptRow> = {}): TranscriptRow => ({ kind, text, ...over });

describe("groupTurnRows", () => {
  it("makes one frame per run of the same speaker", () => {
    const blocks = groupTurnRows([
      row("user", "ask"),
      row("assistant", "thinking about it"),
      row("assistant", "still me"),
      row("tool", "Bash", { call: true }),
      row("tool", "the output"),
      row("assistant", "done"),
    ]);
    expect(blocks.map((b) => [b.kind, b.rows.length])).toEqual([
      ["user", 1],
      ["assistant", 2],
      ["tool", 2],
      ["assistant", 1],
    ]);
  });

  it("keeps a second question in its own frame", () => {
    expect(groupTurnRows([row("user", "one"), row("assistant", "a"), row("user", "two")]).map((b) => b.kind)).toEqual(["user", "assistant", "user"]);
  });

  it("answers nothing for a turn with no rows", () => {
    expect(groupTurnRows([])).toEqual([]);
  });

  // Which rows are CALLS is the host's answer, not a guess from the shape: both halves arrive as
  // `kind: "tool"`, and "short and single-line means a name" is a guess about four agents at once.
  it("collects what RAN from the rows the host marked", () => {
    const blocks = groupTurnRows([row("tool", "Bash ls -la", { call: true }), row("tool", "total 12\nsrc"), row("tool", "Read", { call: true })]);
    expect(blocks[0]?.calls).toEqual(["Bash ls -la", "Read"]);
  });

  it("takes only the first LINE of a call, because the label is one line", () => {
    const blocks = groupTurnRows([row("tool", "Bash\nwith a second line", { call: true })]);
    expect(blocks[0]?.calls).toEqual(["Bash"]);
  });

  it("marks no calls on rows the host did not mark", () => {
    expect(groupTurnRows([row("tool", "some output")])[0]?.calls).toEqual([]);
  });
});

describe("toolBlockLabel", () => {
  it("names what ran", () => {
    const [block] = groupTurnRows([row("tool", "Bash", { call: true }), row("tool", "out"), row("tool", "Read", { call: true })]);
    expect(block && toolBlockLabel(block)).toBe("Bash · Read");
  });

  // A frame whose calls fell outside the window still has to say what it is, or it reads as an
  // empty box with a chevron.
  it.each([
    [1, "1 tool result"],
    [3, "3 tool results"],
  ])("counts %i unmarked rows as a fallback", (count, expected) => {
    const [block] = groupTurnRows(Array.from({ length: count }, () => row("tool", "output")));
    expect(block && toolBlockLabel(block)).toBe(expected);
  });
});
