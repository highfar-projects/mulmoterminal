// @vitest-environment node
// A finished build's originals over real HTTP: the folder comes from the build's record, and a build nobody knows is
// refused rather than read from somewhere.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import { BlueprintRefusal, type BlueprintExecutor } from "../../../server/blueprint/executor";
import { blueprintRunSchema } from "../../../common/blueprint/run";

let projectDir = "";
const run = () =>
  blueprintRunSchema.parse({
    id: "run-00000001",
    projectDir,
    basePackDir: "/packs/docs",
    usecasePackDir: "/packs/polish",
    steps: [{ id: "polish", title: "整える", description: "", skill: "skills/polish", check: "true", gates: [], reads: [], origin: "usecase" }],
    createdAtMs: 1,
    answers: {},
  });
const unused = async (): Promise<never> => {
  throw new Error("not used here");
};
const executor: BlueprintExecutor = {
  create: unused,
  view: async (runId) => {
    if (runId !== "run-00000001") throw new BlueprintRefusal(`no blueprint run ${runId}`);
    return { run: run(), state: { steps: {} } };
  },
  humanEvent: unused,
  ask: unused,
  list: async () => [],
  workingIn: async () => null,
  specView: unused,
  say: unused,
  reportView: unused,
  recover: unused,
  archive: unused,
};

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  mountBlueprintRoutes(app, {
    executor,
    ensureOwner: async () => undefined,
    packRoots: [],
    now: () => 42,
    isTrusted: async () => true,
    workspace: tmpdir(),
    home: tmpdir(),
    savedFolders: () => [],
    collections: { list: async () => [], snapshot: async () => ({ kind: "unknown" }) },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "bp-originals-route-"));
});
afterEach(() => rm(projectDir, { recursive: true, force: true }));

const get = async (runId: string) => {
  const res = await fetch(`${base}/api/blueprints/runs/${runId}/originals`);
  return { status: res.status, body: await res.json() };
};

describe("GET /api/blueprints/runs/:id/originals", () => {
  it("pairs the originals in the build's folder with the files now", async () => {
    await mkdir(path.join(projectDir, ".blueprint", "originals"), { recursive: true });
    await writeFile(path.join(projectDir, ".blueprint", "originals", "a.md"), "before\n");
    await writeFile(path.join(projectDir, "a.md"), "after\n");
    expect(await get("run-00000001")).toEqual({ status: 200, body: { files: [{ path: "a.md", original: "before\n", current: "after\n" }], more: false } });
  });

  it("does not read an original that is a link out of the folder", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "bp-originals-outside-"));
    try {
      await writeFile(path.join(outside, "secret.md"), "not the build's\n");
      await mkdir(path.join(projectDir, ".blueprint", "originals"), { recursive: true });
      await symlink(path.join(outside, "secret.md"), path.join(projectDir, ".blueprint", "originals", "secret.md"));
      await writeFile(path.join(projectDir, "secret.md"), "now\n");
      expect((await get("run-00000001")).body).toEqual({ files: [], more: false });
      // The file now can be a link too; it is read as gone, never followed.
      await writeFile(path.join(projectDir, ".blueprint", "originals", "linked.md"), "before\n");
      await symlink(path.join(outside, "secret.md"), path.join(projectDir, "linked.md"));
      expect((await get("run-00000001")).body).toEqual({ files: [{ path: "linked.md", original: "before\n", current: null }], more: false });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("has nothing for a build that kept no originals", async () => {
    expect(await get("run-00000001")).toEqual({ status: 200, body: { files: [], more: false } });
  });

  it("refuses a build nobody knows", async () => {
    expect((await get("run-99999999")).status).toBe(409);
  });
});
