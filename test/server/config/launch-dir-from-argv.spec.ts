// @vitest-environment node
import { describe, it, expect } from "vitest";
import { launchDirFromArgv } from "../../../server/config/launch-dir-from-argv";

describe("launchDirFromArgv", () => {
  it("takes the directory the launcher passed", () => {
    expect(launchDirFromArgv(["node", "index.ts", "--port", "1", "--launch-dir", "/home/u/My Projects"], "/pkg")).toBe("/home/u/My Projects");
  });

  // `yarn dev` runs the server directly, where its own cwd is the directory the user is in.
  it("falls back to the process's own directory when none was passed", () => {
    expect(launchDirFromArgv(["node", "index.ts", "--port", "1"], "/repo")).toBe("/repo");
  });

  it.each([[["--launch-dir"]], [["--launch-dir", ""]], [["--launch-dir", "--port", "1"]]])("falls back when the flag has no usable value (%j)", (argv) => {
    expect(launchDirFromArgv(argv, "/repo")).toBe("/repo");
  });
});
