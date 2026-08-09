// @vitest-environment node
//
// The feature this whole change exists for, asserted end to end: TWO roots, each owning a
// collection under the SAME slug, served through the same routes without bleeding into each
// other. Nothing before this could express it — with one ambient root, a slug was globally
// unique by construction, so "reads the right one" was true by accident rather than by rule.
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { appRequest } from "../../helpers/appRequest.js";
import { initCollectionsBackend, mountCollectionRoutes } from "../../../server/backends/collections.js";
import { projectId } from "../../../server/infra/project-root.js";
import { makeTempDir } from "../../support/tempDir";

const schemaFor = (title: string) => ({
  title,
  icon: "star",
  dataPath: "data/tasks/items",
  primaryKey: "id",
  fields: {
    id: { type: "string", label: "ID", primary: true, required: true },
    name: { type: "string", label: "Name" },
  },
});

/** A root holding one `tasks` collection with one record — the same slug in both, which is
 *  the case a single-root engine could not tell apart. */
function makeProject(prefix: string, title: string, recordName: string): string {
  const root = makeTempDir(prefix);
  mkdirSync(path.join(root, ".claude", "skills", "tasks"), { recursive: true });
  writeFileSync(path.join(root, ".claude", "skills", "tasks", "schema.json"), JSON.stringify(schemaFor(title)));
  mkdirSync(path.join(root, "data", "tasks", "items"), { recursive: true });
  writeFileSync(path.join(root, "data", "tasks", "items", "one.json"), JSON.stringify({ id: "one", name: recordName }));
  return root;
}

describe("collections served from a named project", () => {
  let request: ReturnType<typeof appRequest>;
  let workspace = "";
  let other = "";

  beforeAll(() => {
    workspace = makeProject("mt-scope-ws-", "Workspace Tasks", "from-workspace");
    other = makeProject("mt-scope-other-", "Other Tasks", "from-other");
    initCollectionsBackend({ workspace, knownProjects: () => [{ label: "other", path: other }] });

    const app = express();
    app.use(express.json());
    mountCollectionRoutes(app);
    request = appRequest(app);
  });

  it("serves the workspace when no project is named", async () => {
    const res = await request("/api/collections/tasks/detail");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { collection: { title: string }; items: Array<{ name: string }> };
    expect(body.collection.title).toBe("Workspace Tasks");
    expect(body.items.map((item) => item.name)).toEqual(["from-workspace"]);
  });

  // The assertion the feature is about: same slug, same route, different root.
  it("serves the named project's collection under the same slug", async () => {
    const res = await request(`/api/collections/tasks/detail?project=${projectId(other)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { collection: { title: string }; items: Array<{ name: string }> };
    expect(body.collection.title).toBe("Other Tasks");
    expect(body.items.map((item) => item.name)).toEqual(["from-other"]);
  });

  it("writes into the named project, leaving the workspace untouched", async () => {
    const created = await request(`/api/collections/tasks/items?project=${projectId(other)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "two", name: "written-in-other" }),
    });
    expect(created.status).toBe(200);

    const inOther = (await (await request(`/api/collections/tasks/detail?project=${projectId(other)}`)).json()) as { items: Array<{ id: string }> };
    expect(inOther.items.map((item) => item.id).sort()).toEqual(["one", "two"]);

    const inWorkspace = (await (await request("/api/collections/tasks/detail")).json()) as { items: Array<{ id: string }> };
    expect(inWorkspace.items.map((item) => item.id)).toEqual(["one"]);
  });

  // A typo in a query parameter is the client's error. Answering 500 would read as "the server
  // broke", and — worse — an ignored parameter would have served the workspace silently.
  it("answers 400 for a project it cannot resolve", async () => {
    const res = await request("/api/collections/tasks/detail?project=0123456789abcdef");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("unknown project");
  });

  it("scopes the collection LIST to the named project too, not only the detail route", async () => {
    const res = await request("/api/collections/list?project=" + projectId(other));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { collections: Array<{ slug: string; title: string }> };
    expect(body.collections.find((c) => c.slug === "tasks")?.title).toBe("Other Tasks");
  });
});
