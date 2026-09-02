// @vitest-environment node
//
// The other half of collectionStagingServerWorkspace.spec.ts, and the one that keeps #1925's fix
// from reaching people it was never about.
//
// `npx mulmoterminal` run inside a git repository makes that repo `CLAUDE_CWD` — the workspace
// this server serves — and it is emphatically not a staged-authoring workspace: nothing stages
// into it, and growing a second copy of every skill definition under `data/skills/` there would
// be a change nobody asked for. So the staging base is offered to the server's own workspace only
// on EVIDENCE — a `data/skills/<slug>/schema.json`, the layout a staged collection actually has —
// and a repo without one answers exactly as it did before this fix, in BOTH knobs: the read and
// the authoring guide.
//
// `data/skills` merely existing is deliberately NOT the evidence. It is a generic-looking path a
// repository can own for its own reasons, and treating the name as proof would redirect where the
// agent authors on the strength of a directory that means nothing.
//
// Its own file because `configureCollectionHost` binds one workspace per process, and this one
// has to be a workspace that starts with no staging tree.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readCustomViewHtml, loadCollection } from "@mulmoclaude/core/collection/server";

import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { manageCollectionHandlerFor } from "../../../server/infra/collection-tool.js";
import { makeTempDir } from "../../support/tempDir";

const SCHEMA = {
  title: "Tasks",
  icon: "star",
  dataPath: "data/tasks/items",
  primaryKey: "id",
  fields: { id: { type: "string", label: "ID", primary: true, required: true } },
  views: [{ id: "v1", file: "views/v1.html", label: "Custom", capabilities: ["read"] }],
};

async function readView(root: string): Promise<string | null> {
  const collection = await loadCollection("tasks", { workspaceRoot: root });
  if (!collection) throw new Error("fixture collection did not load");
  return readCustomViewHtml(collection, "views/v1.html", { workspaceRoot: root });
}

const authoringGuide = (root: string) => manageCollectionHandlerFor(root)({ action: "schemaDocs", topic: "Anatomy of a collection skill" });

describe("a launch directory with no staging tree is not a staged workspace", () => {
  const savedWorkspaceEnv = process.env.MULMOCLAUDE_WORKSPACE_PATH;
  let managed = "";
  // A git repository somebody ran the launcher inside: the committed layout, no `data/skills`.
  let repo = "";

  beforeAll(() => {
    managed = makeTempDir("mt-unstaged-managed-");
    repo = makeTempDir("mt-unstaged-repo-");

    const skillDir = path.join(repo, ".claude", "skills", "tasks");
    mkdirSync(path.join(skillDir, "views"), { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), "# tasks");
    writeFileSync(path.join(skillDir, "schema.json"), JSON.stringify(SCHEMA));
    writeFileSync(path.join(skillDir, "views", "v1.html"), "<body>committed view</body>");
    mkdirSync(path.join(repo, "data", "tasks", "items"), { recursive: true });

    // A `data/skills` that holds no collection — the case a bare existence check would have got
    // wrong, flipping the repo to staged authoring on the strength of a directory name.
    mkdirSync(path.join(repo, "data", "skills", "notes"), { recursive: true });
    writeFileSync(path.join(repo, "data", "skills", "README.md"), "not a collection");

    // The managed workspace is somewhere else entirely and is not otherwise used here — it only
    // has to not be `repo`, so `isManagedWorkspace` cannot be what answers for it.
    process.env.MULMOCLAUDE_WORKSPACE_PATH = managed;
    initCollectionsBackend({ workspace: repo, knownProjects: () => [] });
  });

  afterAll(() => {
    if (savedWorkspaceEnv === undefined) delete process.env.MULMOCLAUDE_WORKSPACE_PATH;
    else process.env.MULMOCLAUDE_WORKSPACE_PATH = savedWorkspaceEnv;
  });

  it("serves the view the repo commits", async () => {
    expect(await readView(repo)).toContain("committed view");
  });

  // The half that would otherwise change silently: the agent must still be told to author in the
  // skill dir, so nothing starts writing a `data/skills` tree into somebody's repository.
  // Asserted on the INSTRUCTION, not the string — the direct variant still says the words
  // "data/skills", in the sentence telling the agent never to write there.
  it("still serves the direct authoring guide", async () => {
    const docs = await authoringGuide(repo);
    expect(docs).toContain("Author under `.claude/skills/<slug>/`");
    expect(docs).not.toContain("Author under `data/skills/<slug>/`");
  });
});
