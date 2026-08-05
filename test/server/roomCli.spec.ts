// @vitest-environment node
// The CLI's argument parsing, on its own — because the argument being parsed is a MESSAGE somebody
// is posting, and a parser that treats every `--token` as a flag silently eats part of it
// (Codex review on #1456). `bin/*.js` is plain JS with no other coverage, so this is where it gets
// pinned.
import { describe, it, expect } from "vitest";

const { positionalForTest, flagForTest } = await import("../../bin/room.js");

describe("room CLI arguments", () => {
  it("keeps the whole message, including words that look like flags", () => {
    const args = ["post", "standup", "use", "--force", "carefully"];
    expect(positionalForTest(args)).toEqual(["post", "standup", "use", "--force", "carefully"]);
  });

  it("still consumes the flags it does know, and their values", () => {
    const args = ["post", "standup", "hello", "--port", "34599", "--from", "ci"];
    expect(positionalForTest(args)).toEqual(["post", "standup", "hello"]);
    expect(flagForTest(args, "--from")).toBe("ci");
  });

  // A message that really does begin with a known flag still has to be postable.
  it("stops parsing flags at `--`", () => {
    expect(positionalForTest(["post", "standup", "--", "--port", "is", "the", "topic"])).toEqual(["post", "standup", "--port", "is", "the", "topic"]);
  });

  it("does not treat an unknown flag as taking a value", () => {
    expect(positionalForTest(["post", "r", "--wat", "keep-me"])).toEqual(["post", "r", "--wat", "keep-me"]);
  });
});
