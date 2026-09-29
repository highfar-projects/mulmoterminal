import { describe, it, expect } from "vitest";
import { markUnreadTarget, type MarkableRow } from "../../../src/components/markUnreadKey";
import type { AttentionStatus } from "../../../src/components/attentionStatus";

const row = (uid: number, status: AttentionStatus, markable = true): MarkableRow => ({ uid, status, markable });
const connected = () => true;

describe("markUnreadTarget", () => {
  it("marks an idle cell unread and a waiting one read", () => {
    expect(markUnreadTarget([row(1, "idle")], 1, null, connected)).toEqual({ uid: 1, waiting: true });
    expect(markUnreadTarget([row(1, "done")], 1, null, connected)).toEqual({ uid: 1, waiting: false });
    expect(markUnreadTarget([row(1, "blocked")], 1, null, connected)).toEqual({ uid: 1, waiting: false });
  });

  it("does nothing to a cell mid-turn", () => {
    expect(markUnreadTarget([row(1, "working")], 1, null, connected)).toBeNull();
  });

  it("aims at the enlarged cell over the one holding the cursor", () => {
    const rows = [row(1, "idle"), row(2, "done")];
    expect(markUnreadTarget(rows, 2, 1, connected)).toEqual({ uid: 2, waiting: false });
  });

  it("falls back to the cursor's cell when nothing is enlarged", () => {
    const rows = [row(1, "idle"), row(2, "done")];
    expect(markUnreadTarget(rows, null, 1, connected)).toEqual({ uid: 1, waiting: true });
  });

  it("does nothing with no cell to name", () => {
    expect(markUnreadTarget([row(1, "idle")], null, null, connected)).toBeNull();
    expect(markUnreadTarget([], 1, 1, connected)).toBeNull();
    expect(markUnreadTarget([row(1, "idle")], 9, null, connected)).toBeNull();
  });

  it("does nothing to a cell that holds no markable session", () => {
    expect(markUnreadTarget([row(1, "idle", false)], 1, null, connected)).toBeNull();
    expect(markUnreadTarget([row(1, "done", false)], 1, null, connected)).toBeNull();
  });

  it("does nothing while the cell's socket is closed, and asks about the right cell", () => {
    const asked: number[] = [];
    const closed = (uid: number) => {
      asked.push(uid);
      return false;
    };
    expect(markUnreadTarget([row(1, "idle"), row(2, "idle")], 2, 1, closed)).toBeNull();
    expect(asked).toEqual([2]);
  });
});
