// @vitest-environment node
import { describe, it, expect } from "vitest";
import { shouldCloseEndedCell, STARTUP_WINDOW_MS, type EndedCellExit } from "../../common/endedCellClose";

const ended = (over: Partial<EndedCellExit> = {}): EndedCellExit => ({ sessionEnded: true, lifetimeMs: 60_000, worktreeCell: false, ...over });

describe("shouldCloseEndedCell", () => {
  it("closes an agent cell whose session ended after it had started", () => {
    expect(shouldCloseEndedCell(ended())).toBe(true);
    expect(shouldCloseEndedCell(ended({ lifetimeMs: STARTUP_WINDOW_MS }))).toBe(true);
  });

  // A lost tmux client leaves the agent running; closing on it drops a live session.
  it("keeps the cell when only the pty ended", () => {
    expect(shouldCloseEndedCell(ended({ sessionEnded: false }))).toBe(false);
  });

  // Under tmux a launch failure exits 0 too, so the lifetime is what keeps its banner on screen.
  it("keeps a cell whose agent died inside the startup window", () => {
    expect(shouldCloseEndedCell(ended({ lifetimeMs: STARTUP_WINDOW_MS - 1 }))).toBe(false);
    expect(shouldCloseEndedCell(ended({ lifetimeMs: 0 }))).toBe(false);
  });

  it("keeps the cell when the frame named no lifetime", () => {
    expect(shouldCloseEndedCell(ended({ lifetimeMs: null }))).toBe(false);
  });

  // Its close asks whether to keep the worktree, which is not asked unprompted.
  it("keeps a worktree cell", () => {
    expect(shouldCloseEndedCell(ended({ worktreeCell: true }))).toBe(false);
  });
});
