// @vitest-environment node
import { describe, it, expect } from "vitest";

import { buildPushDetail, pushWhere, shouldSuppressPush, wantsPushKind, NO_CWD_LABEL } from "../../../server/session/taskPushRules.js";

describe("buildPushDetail", () => {
  it("prefers the reply over the AI title", () => {
    expect(buildPushDetail({ reply: "did the thing", aiTitle: "the thing" })).toBe("did the thing");
  });

  it("falls back to the AI title when there is no reply", () => {
    expect(buildPushDetail({ reply: null, aiTitle: "the thing" })).toBe("the thing");
  });

  // `||`, not `??`: an empty string at any tier means "nothing usable here", so it is skipped
  // rather than pinned as the body.
  it("skips an empty-string reply and takes the AI title", () => {
    expect(buildPushDetail({ reply: "", aiTitle: "the thing" })).toBe("the thing");
  });

  it("returns the empty string when nothing is present", () => {
    expect(buildPushDetail({ reply: null, aiTitle: undefined })).toBe("");
  });

  it("returns the empty string when every tier is empty", () => {
    expect(buildPushDetail({ reply: "", aiTitle: "" })).toBe("");
  });

  // The user's own prompt was a tier here, between the reply and the title, and it is what the
  // phone showed whenever the reply could not be read — their words read back to them, saying
  // nothing about the turn (#1696). Nothing may put it back: the type no longer carries it, and
  // this pins the reason so a later "the body is empty, use what we have" doesn't re-add it.
  it("says nothing rather than reading the user's own prompt back to them", () => {
    expect(buildPushDetail({ reply: null, aiTitle: undefined })).toBe("");
  });
});

describe("shouldSuppressPush", () => {
  it("suppresses when the session is hidden", () => {
    expect(shouldSuppressPush(true, false)).toBe(true);
  });

  it("suppresses when the session is a translation worker", () => {
    expect(shouldSuppressPush(false, true)).toBe(true);
  });

  it("suppresses when both flags are set", () => {
    expect(shouldSuppressPush(true, true)).toBe(true);
  });

  it("does not suppress a real user task", () => {
    expect(shouldSuppressPush(false, false)).toBe(false);
  });
});

describe("pushWhere", () => {
  it("uses the working directory's basename when a cwd is present", () => {
    expect(pushWhere("/Users/isamu/ss/llm/mulmoterminal2")).toBe("mulmoterminal2");
  });

  it("falls back to the sentinel label when there is no cwd", () => {
    expect(pushWhere(null)).toBe(NO_CWD_LABEL);
    expect(pushWhere(null)).toBe("session");
  });
});

// The setting exists because "waiting" fires once per permission prompt, which on a long task
// is most of the pushes — a user has to be able to keep the finished-turn ones (#850).
describe("wantsPushKind", () => {
  it("sends only a kind the user picked", () => {
    expect(wantsPushKind(true, ["finished"], "finished")).toBe(true);
    expect(wantsPushKind(true, ["finished"], "waiting")).toBe(false);
    expect(wantsPushKind(true, ["waiting"], "waiting")).toBe(true);
  });

  it("sends nothing while the master switch is off, whatever the kinds say", () => {
    expect(wantsPushKind(false, ["finished", "waiting"], "finished")).toBe(false);
    expect(wantsPushKind(false, ["finished", "waiting"], "waiting")).toBe(false);
  });

  // Distinct from the master switch being off: the user kept "notify me" on and unticked every
  // moment. Same silence, but the two are stored separately so neither erases the other.
  it("sends nothing when no kind is picked", () => {
    expect(wantsPushKind(true, [], "finished")).toBe(false);
    expect(wantsPushKind(true, [], "waiting")).toBe(false);
  });
});

// A user's SCHEDULED task is a background session in every other respect — out of the chat list,
// never bold, no grid cell — and this is the one respect where that is wrong. It is a task the
// user configured, running while they are away, so the phone is the only way they would ever hear
// about it: suppressing it silences exactly the case push exists for (Codex, PR #1196).
describe("shouldSuppressPush — a user's scheduled task", () => {
  it("lets it through, even though it is a background session", () => {
    expect(shouldSuppressPush(true, false, true)).toBe(false);
  });

  it("still suppresses every OTHER background session", () => {
    // A collection's refresh, a plugin's hidden spawnBackgroundChat: nobody configured those to
    // report to them.
    expect(shouldSuppressPush(true, false, false)).toBe(true);
    expect(shouldSuppressPush(true, false)).toBe(true); // the parameter is optional
  });

  it("refuses a translation worker whatever else is true", () => {
    // An internal helper with no output a person reads — there is nothing to tell them about, so
    // this one is not an exception waiting to be made.
    expect(shouldSuppressPush(true, true, true)).toBe(true);
    expect(shouldSuppressPush(false, true, true)).toBe(true);
  });

  it("leaves an ordinary session alone", () => {
    expect(shouldSuppressPush(false, false, false)).toBe(false);
  });
});
