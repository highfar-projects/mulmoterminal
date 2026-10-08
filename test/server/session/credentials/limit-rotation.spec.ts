// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  rotateNearLimit,
  rotateOnLimit,
  type LimitRotationDeps,
  type MovableSession,
  type MovedFrom,
} from "../../../../server/session/credentials/limit-rotation";

const ID = "44444444-5555-4666-8777-888888888888";

interface Harness {
  deps: LimitRotationDeps;
  entry: MovableSession;
  order: string[];
  closeSocket: ReturnType<typeof vi.fn>;
}

const harness = (over: Partial<LimitRotationDeps> = {}, entryOver: Partial<MovableSession> = {}): Harness => {
  const order: string[] = [];
  const closeSocket = vi.fn(() => order.push("close"));
  const entry: MovableSession = { agent: "claude", ws: { close: closeSocket }, ...entryOver };
  const deps: LimitRotationDeps = {
    rotationEnabled: () => true,
    sessionToken: () => "a",
    markSpent: vi.fn((id: string) => order.push(`spent:${id}`)),
    hasFreeChoice: () => true,
    entryOf: () => entry,
    reap: vi.fn(() => order.push(`reap:ws=${entry.ws === null ? "detached" : "attached"}`)),
    labelOf: (id) => `Token ${id.toUpperCase()}`,
    noteMovedFrom: vi.fn((_id: string, move: MovedFrom) => order.push(`note:${move.fromLabel}:${move.reason}`)),
    isNearLimit: () => false,
    ...over,
  };
  return { deps, entry, order, closeSocket };
};

describe("rotateOnLimit (#2919)", () => {
  it("marks the token spent, detaches the socket before ending the process, then closes it bare", () => {
    const { deps, order } = harness();
    expect(rotateOnLimit(deps, ID)).toBe("moved");
    expect(order).toEqual(["spent:a", "note:Token A:limit-hit", "reap:ws=detached", "close"]);
  });

  it("leaves a session rotation did not start alone", () => {
    const { deps, order } = harness({ sessionToken: () => undefined });
    expect(rotateOnLimit(deps, ID)).toBe("not-rotated");
    expect(order).toEqual([]);
  });

  it("does nothing at all while rotation is off, even for a recorded session", () => {
    const { deps, order } = harness({ rotationEnabled: () => false });
    expect(rotateOnLimit(deps, ID)).toBe("not-rotated");
    expect(order).toEqual([]);
  });

  it("keeps the session when every other credential is held out, but still marks the spent one", () => {
    const { deps, order, closeSocket } = harness({ hasFreeChoice: () => false });
    expect(rotateOnLimit(deps, ID)).toBe("no-free-credential");
    expect(order).toEqual(["spent:a"]);
    expect(closeSocket).not.toHaveBeenCalled();
  });

  it("marks the spent one even when the session is already gone", () => {
    const { deps, order } = harness({ entryOf: () => undefined });
    expect(rotateOnLimit(deps, ID)).toBe("no-session");
    expect(order).toEqual(["spent:a"]);
  });

  it("never moves a non-claude pty", () => {
    const { deps } = harness({}, { agent: "codex" });
    expect(rotateOnLimit(deps, ID)).toBe("no-session");
    expect(deps.reap).not.toHaveBeenCalled();
  });

  it("moves a session with no socket attached", () => {
    const { deps, entry } = harness();
    entry.ws = null;
    expect(rotateOnLimit(deps, ID)).toBe("moved");
    expect(deps.reap).toHaveBeenCalledWith(ID);
  });
});

describe("rotateNearLimit (#2919)", () => {
  it("moves a session whose credential is at the switch line, without marking it spent", () => {
    const { deps, order } = harness({ isNearLimit: () => true });
    expect(rotateNearLimit(deps, ID)).toBe("moved");
    expect(order).toEqual(["note:Token A:near-limit", "reap:ws=detached", "close"]);
  });

  it("leaves a session below the line alone", () => {
    const { deps, order } = harness({ isNearLimit: () => false });
    expect(rotateNearLimit(deps, ID)).toBe("below-limit");
    expect(order).toEqual([]);
  });

  it("leaves a session rotation did not start alone, whatever its credential", () => {
    const { deps, order } = harness({ sessionToken: () => undefined, isNearLimit: () => true });
    expect(rotateNearLimit(deps, ID)).toBe("not-rotated");
    expect(order).toEqual([]);
  });

  it("stays put when there is nowhere free to go", () => {
    const { deps, order } = harness({ isNearLimit: () => true, hasFreeChoice: () => false });
    expect(rotateNearLimit(deps, ID)).toBe("no-free-credential");
    expect(order).toEqual([]);
  });
});
