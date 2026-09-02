// @vitest-environment node
//
// A staged collection's `views/*.html` lives ONLY in `data/skills/<slug>/` — the mirror into
// `.claude/skills/<slug>/` carries SKILL.md, schema.json and templates and nothing else. So the
// engine's staging base is not an optimisation there: drop it and the read is left with a
// directory that never holds the file, which is a 404 on every custom view (#1925).
//
// Which roots get that base is what this file pins. MulmoClaude's workspace is always
// `~/mulmoclaude`; ours is `CLAUDE_CWD`, the directory the launcher was started in, and the two
// are the same path only by coincidence. Both are a workspace and both must read staging — while
// a SAVED PROJECT must still get none, because there a stray `data/skills` file would shadow the
// skill the repo actually commits.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCustomViewHtml, loadCollection } from "@mulmoclaude/core/collection/server";

import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { makeTempDir } from "../../support/tempDir";

const SCHEMA = {
  title: "Tasks",
  icon: "star",
  dataPath: "data/tasks/items",
  primaryKey: "id",
  fields: { id: { type: "string", label: "ID", primary: true, required: true } },
  views: [{ id: "v1", file: "views/v1.html", label: "Custom", capabilities: ["read"] }],
};

/** Write the skill dir discovery anchors on, with `viewBody` only when the caller wants the view
 *  file beside it — a staged collection has no `views/` there at all. */
function writeSkillDir(root: string, viewBody: string | null): void {
  const skillDir = path.join(root, ".claude", "skills", "tasks");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), "# tasks");
  writeFileSync(path.join(skillDir, "schema.json"), JSON.stringify(SCHEMA));
  if (viewBody !== null) {
    mkdirSync(path.join(skillDir, "views"), { recursive: true });
    writeFileSync(path.join(skillDir, "views", "v1.html"), viewBody);
  }
  mkdirSync(path.join(root, "data", "tasks", "items"), { recursive: true });
}

/** The staging tree a staged-authoring host produces: the schema AND the view HTML. */
function writeStagingDir(root: string, viewBody: string): void {
  const staging = path.join(root, "data", "skills", "tasks");
  mkdirSync(path.join(staging, "views"), { recursive: true });
  writeFileSync(path.join(staging, "schema.json"), JSON.stringify(SCHEMA));
  writeFileSync(path.join(staging, "views", "v1.html"), viewBody);
}

async function readView(root: string): Promise<string | null> {
  const collection = await loadCollection("tasks", { workspaceRoot: root });
  if (!collection) throw new Error(`fixture collection did not load for ${root}`);
  // The signature the issue reported: `detail` resolves the collection fine, and only the view
  // file 404s. Asserted here so a failure below cannot be read as "the fixture never loaded".
  expect(collection.source).toBe("project");
  return readCustomViewHtml(collection, "views/v1.html", { workspaceRoot: root });
}

describe("staged custom views are readable from every workspace, and from no project", () => {
  const savedWorkspaceEnv = process.env.MULMOCLAUDE_WORKSPACE_PATH;
  // `~/mulmoclaude` — the root MulmoClaude serves, which this server may not be running in.
  let managed = "";
  // CLAUDE_CWD — the directory THIS server was launched in, and the workspace it serves.
  let workspace = "";
  let project = "";

  // ONE binding for the file: `configureCollectionHost` refuses a second call with a different
  // host, deliberately — silently redirecting later filesystem work to another workspace would be
  // a bug, not a feature. So the roots are built once and each test only reads.
  beforeAll(() => {
    managed = makeTempDir("mt-staged-managed-");
    workspace = makeTempDir("mt-staged-workspace-");
    project = makeTempDir("mt-staged-project-");

    // Both workspaces hold the staged layout: no `views/` in the skill dir, the HTML in staging.
    writeSkillDir(managed, null);
    writeStagingDir(managed, "<body>managed staged view</body>");
    writeSkillDir(workspace, null);
    writeStagingDir(workspace, "<body>workspace staged view</body>");

    // The project holds the layout a repo commits — plus a stray staging copy.
    writeSkillDir(project, "<body>committed view</body>");
    writeStagingDir(project, "<body>STRAY</body>");

    // `isManagedWorkspace` compares against this, so a temp dir can stand in for ~/mulmoclaude.
    // Deliberately NOT the workspace below: that divergence is the whole bug.
    process.env.MULMOCLAUDE_WORKSPACE_PATH = managed;
    initCollectionsBackend({ workspace, knownProjects: () => [{ label: "project", path: project }] });
  });

  afterAll(() => {
    if (savedWorkspaceEnv === undefined) delete process.env.MULMOCLAUDE_WORKSPACE_PATH;
    else process.env.MULMOCLAUDE_WORKSPACE_PATH = savedWorkspaceEnv;
  });

  // The regression. Before #1925 the staging base was handed out only for `~/mulmoclaude`, so a
  // server launched anywhere else could not read the views in the workspace it was serving —
  // while MulmoClaude, pointed at the same directory, rendered them.
  it("reads the staged view from the workspace this server serves", async () => {
    expect(await readView(workspace)).toContain("workspace staged view");
  });

  // A union, not a replacement: `~/mulmoclaude` keeps its staging even when this server is
  // running somewhere else and merely knows it as another root.
  it("still reads the staged view from the managed mulmoclaude workspace", async () => {
    expect(await readView(managed)).toContain("managed staged view");
  });

  // The guarantee that must survive the widening. A saved project is not a workspace: it has no
  // bridge and no permission gate to route around, so its `data/skills` is not a source — and the
  // engine reads staging FIRST, so handing one out here would let a stray file win over the skill
  // the repo commits.
  it("does not let a stray data/skills view shadow a project's committed one", async () => {
    const html = await readView(project);
    expect(html).toContain("committed view");
    expect(html).not.toContain("STRAY");
  });
});
