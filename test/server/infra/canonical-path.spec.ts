// @vitest-environment node
//
// The properties `isSameRealPath` has to hold, harvested from the differential run that proved
// the extraction out of `isManagedWorkspace` preserved its behaviour (324 generated spellings,
// 0 mismatches). The harness could not survive — half of it was the code it replaced — so what
// it established lives here instead.
//
// Why any of it matters: two callers decide "is this root a workspace" with this, and a false
// answer is silent. It costs `isManagedWorkspace` the seeding step, and it costs the collection
// engine its staging base — which is a 404 on every staged custom view (#1925), with the file
// sitting right there on disk.
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { isSameRealPath } from "../../../server/infra/canonical-path";
import { makeTempDir } from "../../support/tempDir";

describe("isSameRealPath", () => {
  let home = "";
  let workspace = "";
  let sibling = "";
  let link = "";

  beforeAll(() => {
    home = makeTempDir("mt-realpath-");
    workspace = path.join(home, "mulmoclaude");
    sibling = path.join(home, "elsewhere");
    mkdirSync(path.join(workspace, "data", "skills"), { recursive: true });
    mkdirSync(sibling, { recursive: true });
    link = path.join(home, "link-to-workspace");
    symlinkSync(workspace, link, "dir");
  });

  it("matches a directory against itself, however it is spelled", () => {
    expect(isSameRealPath(workspace, workspace)).toBe(true);
    expect(isSameRealPath(workspace, `${workspace}${path.sep}`)).toBe(true);
    expect(isSameRealPath(workspace, path.join(workspace, "."))).toBe(true);
    expect(isSameRealPath(workspace, path.join(workspace, "data", ".."))).toBe(true);
  });

  // The reason the canonical pass exists at all: `~/mulmoclaude` is a symlink on plenty of
  // machines, and the launcher may name it by either end.
  it("sees through a symlink, in both directions", () => {
    expect(isSameRealPath(link, workspace)).toBe(true);
    expect(isSameRealPath(workspace, link)).toBe(true);
    expect(isSameRealPath(link, link)).toBe(true);
  });

  it("separates distinct directories, including a child and its parent", () => {
    expect(isSameRealPath(workspace, sibling)).toBe(false);
    expect(isSameRealPath(workspace, path.join(workspace, "data"))).toBe(false);
    expect(isSameRealPath(workspace, home)).toBe(false);
  });

  // A root can name a directory that is not there — a workspace the server creates on boot, a
  // preset saved for a folder since deleted. `canonicalPath` re-attaches the missing leaves, so
  // the answer stays about the paths rather than throwing.
  it("answers for a path that does not exist yet", () => {
    const missing = path.join(home, "not-created-yet");
    expect(isSameRealPath(missing, missing)).toBe(true);
    expect(isSameRealPath(missing, path.join(link, "..", "not-created-yet"))).toBe(true);
    expect(isSameRealPath(missing, workspace)).toBe(false);
  });
});
