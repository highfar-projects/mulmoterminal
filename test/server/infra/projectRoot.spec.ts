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
import path from "node:path";

import {
  errorStatus,
  initProjectRoots,
  listProjectRoots,
  projectId,
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

  // Presence, not shape. Express turns `?project=a&project=b` into an array and
  // `?project[x]=y` into an object, so a `typeof === "string"` guard would read both as
  // "absent" and serve the workspace — one project asked for, another served. An empty
  // `?project=` counts too: the client meant to name one.
  it.each([
    ["an unknown id", "0123456789abcdef"],
    ["repeated parameters", ["a", "b"]],
    ["a bracketed object", { x: "y" }],
    ["an empty value", ""],
  ])("refuses %s rather than silently serving the workspace", (_label, project) => {
    initProjectRoots({ workspace: ws });
    expect(() => resolveProjectRoot(requestWith({ project }))).toThrow(/unknown project/);
  });

  it("answers an unknown project as a client error, not a server failure", () => {
    initProjectRoots({ workspace: ws });
    try {
      resolveProjectRoot(requestWith({ project: "nope" }));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(errorStatus(err)).toBe(400);
    }
  });

  // The id is derived, not stored: a restart must not invalidate a URL a view is holding.
  it("resolves a known project by its opaque id", () => {
    const other = makeTempDir("mt-other-project-");
    initProjectRoots({ workspace: ws, knownProjects: () => [{ label: "other", path: other }] });
    expect(resolveProjectRoot(requestWith({ project: projectId(other) }))).toEqual({ workspaceRoot: other });
    expect(resolveProjectRoot(requestWith({ project: projectId(ws) }))).toEqual({ workspaceRoot: ws });
  });

  // The list is read through a thunk on every call: launching from a new directory records a
  // preset, and a list captured at boot would refuse a project the launcher already shows.
  it("sees a project added after boot", () => {
    const added = makeTempDir("mt-added-project-");
    let projects: Array<{ label: string; path: string }> = [];
    initProjectRoots({ workspace: ws, knownProjects: () => projects });
    expect(() => resolveProjectRoot(requestWith({ project: projectId(added) }))).toThrow(/unknown project/);
    projects = [{ label: "added", path: added }];
    expect(resolveProjectRoot(requestWith({ project: projectId(added) }))).toEqual({ workspaceRoot: added });
  });

  it("lists the workspace first, then the saved directories, without repeating one", () => {
    const other = makeTempDir("mt-listed-project-");
    initProjectRoots({
      workspace: ws,
      // The workspace appears among the saved directories too, as it does for anyone who has
      // launched from it — it must be listed once.
      knownProjects: () => [
        { label: "workspace", path: ws },
        { label: "other", path: other },
      ],
    });
    expect(listProjectRoots()).toEqual([
      { id: projectId(ws), label: path.basename(ws) },
      { id: projectId(other), label: "other" },
    ]);
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
