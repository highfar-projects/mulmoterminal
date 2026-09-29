// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { registerCellAction, requestCellAction } from "../../../src/composables/useCellAction";

describe("useCellAction", () => {
  it("routes a request to the handler registered under that key", () => {
    const cell1 = vi.fn(() => true);
    const cell2 = vi.fn(() => true);
    const off1 = registerCellAction("cell-1", cell1);
    const off2 = registerCellAction("cell-2", cell2);

    expect(requestCellAction("cell-2", "restart")).toBe(true);
    expect(cell1).not.toHaveBeenCalled();
    expect(cell2).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });

  it("answers false for a terminal that is not there, or a handler that declines", () => {
    expect(requestCellAction("cell-nobody", "restart")).toBe(false);
    expect(requestCellAction(null, "restart")).toBe(false);
    const off = registerCellAction("cell-3", () => false); // mounted, but no session yet
    expect(requestCellAction("cell-3", "restart")).toBe(false);
    off();
  });

  it("stops routing once unregistered", () => {
    const handler = vi.fn(() => true);
    registerCellAction("cell-4", handler)();
    expect(requestCellAction("cell-4", "restart")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps the LIVE handler when a cell remounts under the same key before the old one tears down", () => {
    const old = vi.fn(() => true);
    const fresh = vi.fn(() => true);
    const offOld = registerCellAction("cell-5", old);
    const offFresh = registerCellAction("cell-5", fresh); // remount: registers first…
    offOld(); // …then the old instance unmounts

    expect(requestCellAction("cell-5", "restart")).toBe(true);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
    offFresh();
  });

  it("hands the handler the action that was asked for", () => {
    const handler = vi.fn(() => true);
    const off = registerCellAction("cell-6", handler);
    requestCellAction("cell-6", "new-here");
    requestCellAction("cell-6", "files");
    expect(handler.mock.calls).toEqual([["new-here"], ["files"]]);
    off();
  });
});
