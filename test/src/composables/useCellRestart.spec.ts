// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { registerCellRestart, requestCellRestart } from "../../../src/composables/useCellRestart";

describe("useCellRestart", () => {
  it("routes a request to the handler registered under that key", () => {
    const cell1 = vi.fn(() => true);
    const cell2 = vi.fn(() => true);
    const off1 = registerCellRestart("cell-1", cell1);
    const off2 = registerCellRestart("cell-2", cell2);

    expect(requestCellRestart("cell-2")).toBe(true);
    expect(cell1).not.toHaveBeenCalled();
    expect(cell2).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });

  it("answers false for a terminal that is not there, or a handler that declines", () => {
    expect(requestCellRestart("cell-nobody")).toBe(false);
    expect(requestCellRestart(null)).toBe(false);
    const off = registerCellRestart("cell-3", () => false); // mounted, but no session yet
    expect(requestCellRestart("cell-3")).toBe(false);
    off();
  });

  it("stops routing once unregistered", () => {
    const handler = vi.fn(() => true);
    registerCellRestart("cell-4", handler)();
    expect(requestCellRestart("cell-4")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps the LIVE handler when a cell remounts under the same key before the old one tears down", () => {
    const old = vi.fn(() => true);
    const fresh = vi.fn(() => true);
    const offOld = registerCellRestart("cell-5", old);
    const offFresh = registerCellRestart("cell-5", fresh); // remount: registers first…
    offOld(); // …then the old instance unmounts

    expect(requestCellRestart("cell-5")).toBe(true);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
    offFresh();
  });
});
