// @vitest-environment node
// The tmux routes are tested with injected spies (tmux-routes.spec.ts); this holds the PRODUCTION
// wiring to what they assume. A `requestCellClose` left out or wired as a no-op would let
// `/api/session/:id/close` reap the session while the cell is told it did not end (#3067).
import { describe, it, expect, vi, afterEach } from "vitest";
import { tmuxRouteDeps } from "../../../server/routes/app-routes.js";
import { markSessionPlaced, ptys } from "../../../server/session/registry.js";

type Entry = NonNullable<ReturnType<typeof ptys.get>>;
const ID = "01234567-89ab-cdef-0123-456789abcdef";
const isEntry = (value: unknown): value is Entry => typeof value === "object" && value !== null;

afterEach(() => {
  ptys.delete(ID);
});

describe("tmuxRouteDeps — the close route's production wiring (#3067)", () => {
  it("marks the live entry so its exit tells the cell the session ended", () => {
    const entry: unknown = { tmux: true, ws: null, cwd: "/repo", agent: "claude" };
    if (!isEntry(entry)) throw new Error("fixture");
    ptys.set(ID, entry);
    tmuxRouteDeps({ isAllowedOrigin: () => true, reap: vi.fn() }).requestCellClose(ID);
    expect(ptys.get(ID)?.closeRequested).toBe(true);
  });

  it("does nothing, and does not throw, for a session with no live entry", () => {
    expect(() => tmuxRouteDeps({ isAllowedOrigin: () => true, reap: vi.fn() }).requestCellClose(ID)).not.toThrow();
    expect(ptys.has(ID)).toBe(false);
  });

  it("reaps with the server's reap and marks placed with the registry's", () => {
    const reap = vi.fn();
    const deps = tmuxRouteDeps({ isAllowedOrigin: () => true, reap });
    expect(deps.reapSession).toBe(reap);
    expect(deps.markPlaced).toBe(markSessionPlaced);
  });
});
