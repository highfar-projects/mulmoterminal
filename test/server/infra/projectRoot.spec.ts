// @vitest-environment node
//
// Pins the guarantee the root-threading buys, which is otherwise invisible: after
// `initCollectionsBackend`, the collection engine has NO ambient root. Every call names its
// own, and one that forgets throws instead of resolving against whichever root happened to be
// bound. On a single-workspace host that difference never shows; on a host with one root per
// project it is the difference between an error and another project's data — so the binding is
// asserted here rather than left to be re-derived from a `null` literal in the wiring.
import { describe, it, expect, beforeEach } from "vitest";
import { getWorkspaceRoot } from "@mulmoclaude/core/collection/server";

import { initCollectionsBackend } from "../../../server/backends/collections.js";
import {
  initProjectRoots,
  projectRootsConfigured,
  resolveProjectRoot,
  resetProjectRootsForTesting,
  workspaceScope,
} from "../../../server/infra/project-root.js";
import { makeTempDir } from "../../support/tempDir";

// Only `resolveProjectRoot`'s parameter type is exercised, so a bare object is the whole
// request this needs — building an express Request here would assert nothing extra.
const requestWith = (query: Record<string, unknown> = {}) => ({ query }) as Parameters<typeof resolveProjectRoot>[0];
const anyRequest = requestWith();

describe("project roots", () => {
  let ws = "";

  beforeEach(() => {
    resetProjectRootsForTesting();
    ws = makeTempDir("mt-project-root-");
  });

  it("is unconfigured until a workspace is bound", () => {
    expect(projectRootsConfigured()).toBe(false);
    expect(() => workspaceScope()).toThrow(/not configured/);
    expect(() => resolveProjectRoot(anyRequest)).toThrow(/not configured/);
  });

  it("refuses a project parameter rather than silently serving the workspace", () => {
    initProjectRoots({ workspace: ws });
    expect(() => resolveProjectRoot(requestWith({ project: "some-project" }))).toThrow(/not enabled/);
  });

  it("resolves every request to the bound workspace", () => {
    initProjectRoots({ workspace: ws });
    expect(projectRootsConfigured()).toBe(true);
    expect(resolveProjectRoot(anyRequest)).toEqual({ workspaceRoot: ws });
    expect(workspaceScope()).toEqual({ workspaceRoot: ws });
  });

  // The regression pin. Binding a STRING root here would restore the silent fallback and every
  // test above would still pass — this is the only assertion that would notice.
  it("leaves the collection engine with no ambient root to fall back to", () => {
    initCollectionsBackend({ workspace: ws });
    expect(() => getWorkspaceRoot()).toThrow(/explicit-root mode/);
    // …while the host still knows the workspace, which is what every call passes today.
    expect(workspaceScope()).toEqual({ workspaceRoot: ws });
  });
});
