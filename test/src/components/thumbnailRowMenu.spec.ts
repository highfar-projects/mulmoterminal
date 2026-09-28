import { describe, it, expect } from "vitest";
import { rowMenuFor, type RowMenuSource } from "../../../src/components/thumbnailRowMenu";

const moves = { canUp: true, canDown: false, reorderable: true };
const row = (over: Partial<RowMenuSource> = {}): RowMenuSource => ({ status: "done", markable: true, parkable: true, parked: false, ...over });

describe("rowMenuFor", () => {
  it("is null when the grid has no row for the cell", () => {
    expect(rowMenuFor(undefined, moves, true)).toBeNull();
  });

  it("carries the moves and the row's park state through", () => {
    expect(rowMenuFor(row({ parked: true }), moves, true)).toMatchObject({ canUp: true, canDown: false, reorderable: true, parkable: true, parked: true });
    expect(rowMenuFor(row({ parkable: false }), moves, true)?.parkable).toBe(false);
  });

  // The mark travels down the cell's socket, so a closed one would drop the press silently.
  it("offers unread/read only while the cell is markable and connected", () => {
    expect(rowMenuFor(row(), moves, true)?.attention).not.toBeNull();
    expect(rowMenuFor(row(), moves, false)?.attention).toBeNull();
    expect(rowMenuFor(row({ markable: false }), moves, true)?.attention).toBeNull();
  });
});
