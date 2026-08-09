// @vitest-environment node
//
// How the phone LEARNS which projects it may name. The handlers could already resolve a named one
// (commandScope.ts); without this they could resolve an id the phone had no way to obtain.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { listCollectionProjects } from "../../../../server/backends/remoteHost/handlers/listCollectionProjects.js";
import { scopeFromCommand } from "../../../../server/backends/remoteHost/commandScope.js";
import { initProjectRoots, projectId, resetProjectRootsForTesting } from "../../../../server/infra/project-root.js";

const WORKSPACE = "/srv/ws";
const PROJECT = "/srv/mag2";

interface Listing {
  projects: { id: string; label: string; cwd?: unknown }[];
}

beforeEach(() => {
  initProjectRoots({ workspace: WORKSPACE, knownProjects: () => [{ label: "mag2", path: PROJECT }] });
});

afterEach(() => {
  resetProjectRootsForTesting();
});

describe("listCollectionProjects", () => {
  it("lists the workspace first, then the saved directories", async () => {
    const { projects } = (await listCollectionProjects({})) as unknown as Listing;
    expect(projects.map((project) => project.label)).toEqual(["ws", "mag2"]);
  });

  // The phone is a genuinely remote client: an absolute root in a command or an artifact
  // publishes the user's home directory over the wire. The browser's listing carries `cwd`
  // because it has to match a project to a cell it is already showing; the phone has no such
  // need, so the path stays on the host.
  it("carries NO path — only the opaque id and a label", async () => {
    const { projects } = (await listCollectionProjects({})) as unknown as Listing;
    for (const project of projects) {
      expect(Object.keys(project).sort()).toEqual(["id", "label"]);
    }
    expect(JSON.stringify(projects)).not.toContain("/srv");
  });

  // The listing is only useful if what it hands out is what the handlers accept — the two halves
  // are separately correct and together are the feature.
  it("hands out ids the command scope resolves", async () => {
    const { projects } = (await listCollectionProjects({})) as unknown as Listing;
    for (const project of projects) {
      expect(scopeFromCommand({ project: project.id })).toEqual({ workspaceRoot: project.label === "ws" ? WORKSPACE : PROJECT });
    }
    expect(projects.map((project) => project.id)).toEqual([projectId(WORKSPACE), projectId(PROJECT)]);
  });

  it("is just the workspace when nothing else is saved", async () => {
    initProjectRoots({ workspace: WORKSPACE });
    const { projects } = (await listCollectionProjects({})) as unknown as Listing;
    expect(projects).toEqual([{ id: projectId(WORKSPACE), label: "ws" }]);
  });
});
