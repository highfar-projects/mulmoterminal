// @vitest-environment node
import { describe, it, expect } from "vitest";
import { peerSessionStatusOf } from "./peerEvents.js";
import { isPeerPushEvent } from "./peerProtocol.js";

describe("peerSessionStatusOf", () => {
  it("reads the fields the phone's status dots need from a peer's session row", () => {
    expect(peerSessionStatusOf({ id: "s1", working: true, waiting: false, event: "UserPromptSubmit", title: "x" })).toEqual({
      id: "s1",
      working: true,
      waiting: false,
      event: "UserPromptSubmit",
    });
  });

  // `publishSessionCreated` sends a row with no `waiting` at all.
  it("reads an absent flag as false and an absent event as null", () => {
    expect(peerSessionStatusOf({ id: "s1", working: false })).toEqual({ id: "s1", working: false, waiting: false, event: null });
  });

  it("refuses a row with no id", () => {
    expect(peerSessionStatusOf({ working: true })).toBeNull();
    expect(peerSessionStatusOf("s1")).toBeNull();
  });
});

describe("isPeerPushEvent", () => {
  it("accepts what a peer publishes and refuses anything missing a field", () => {
    expect(isPeerPushEvent({ sessionId: "s1", kind: "finished", title: "t", body: "b" })).toBe(true);
    expect(isPeerPushEvent({ sessionId: "s1", kind: "finished", title: "t" })).toBe(false);
    expect(isPeerPushEvent(null)).toBe(false);
  });
});
