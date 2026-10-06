// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mobileFilesProjectFor } from "../../../../server/backends/remoteHost/mobileFileProject";

const WS = { id: "ws", cwd: "/home/me/workspace" };
const APP = { id: "app", cwd: "/home/me/workspace/app" };
const OTHER = { id: "other", cwd: "/home/me/other" };
const PROJECTS = [WS, APP, OTHER];
const sharing =
  (...roots: string[]) =>
  (root: string) =>
    roots.includes(root);

describe("mobileFilesProjectFor", () => {
  it("links a session to the project its directory is in", () => {
    expect(mobileFilesProjectFor(PROJECTS, "/home/me/other", sharing(OTHER.cwd))).toBe("other");
    expect(mobileFilesProjectFor(PROJECTS, "/home/me/other/src/deep", sharing(OTHER.cwd))).toBe("other");
  });

  it("picks the deepest containing project, whatever order the list is in", () => {
    expect(mobileFilesProjectFor([APP, WS], "/home/me/workspace/app/src", sharing(WS.cwd, APP.cwd))).toBe("app");
    expect(mobileFilesProjectFor([WS, APP], "/home/me/workspace/app/src", sharing(WS.cwd, APP.cwd))).toBe("app");
  });

  it("does not fall back to an enclosing project when the deepest one shares nothing", () => {
    expect(mobileFilesProjectFor(PROJECTS, "/home/me/workspace/app", sharing(WS.cwd))).toBe("");
  });

  it("answers nothing for a directory no project contains, or no directory at all", () => {
    expect(mobileFilesProjectFor(PROJECTS, "/tmp/elsewhere", sharing(WS.cwd, APP.cwd, OTHER.cwd))).toBe("");
    expect(mobileFilesProjectFor(PROJECTS, "", sharing(WS.cwd))).toBe("");
  });

  it("does not treat a sibling with a shared prefix as containing", () => {
    expect(mobileFilesProjectFor(PROJECTS, "/home/me/other-repo", sharing(OTHER.cwd))).toBe("");
  });
});
