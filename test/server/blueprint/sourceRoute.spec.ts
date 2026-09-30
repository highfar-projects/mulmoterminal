// @vitest-environment node
// Whether a build's source changed since it was copied: source.json in the build's folder against the same source
// taken again, over real HTTP, with a stand-in executor and source.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import { BlueprintRefusal, type BlueprintExecutor } from "../../../server/blueprint/executor";
import type { Snapshot } from "../../../server/blueprint/collectionSnapshot";
import { blueprintRunSchema } from "../../../common/blueprint/run";

const TAKEN_AT = "2026-09-29T00:00:00.000Z";
let projectDir = "";
let retaken: Snapshot = { kind: "unknown" };
const asked: { slug: string; records: boolean }[] = [];

const run = () =>
  blueprintRunSchema.parse({
    id: "run-00000001",
    projectDir,
    basePackDir: "/packs/local",
    usecasePackDir: "/packs/from-collection",
    steps: [{ id: "spec", title: "仕様書", description: "", skill: "skills/spec", check: "true", gates: [], reads: [], origin: "usecase" }],
    createdAtMs: 1,
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
    collections: {
      list: async () => [],
      snapshot: async (slug, _nowMs, records) => {
        asked.push({ slug, records });
        return retaken;
      },
    },
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "bp-source-status-"));
  asked.length = 0;
});
afterEach(() => rm(projectDir, { recursive: true, force: true }));

const writeRecord = async (content: string) => {
  await mkdir(path.join(projectDir, ".blueprint/source"), { recursive: true });
  await writeFile(path.join(projectDir, ".blueprint/source/source.json"), content);
};
const record = (extra: object = {}) =>
  JSON.stringify({ from: "app", start: "Votes", source: "app:f00d", records: true, takenAt: TAKEN_AT, fingerprint: "sha256:then", ...extra });
const ok = (fingerprint: string): Snapshot => ({ kind: "ok", files: [], personal: { fields: [], members: 0 }, fingerprint });
const statusOf = async (runId = "run-00000001") => {
  const res = await fetch(`${base}/api/blueprints/runs/${runId}/source`);
  return { status: res.status, body: await res.json() };
};

describe("GET /api/blueprints/runs/:id/source", () => {
  it("takes the source named in source.json again, with its records as copied, and says it is the same", async () => {
    await writeRecord(record());
    retaken = ok("sha256:then");
    expect(await statusOf()).toEqual({ status: 200, body: { status: "same" } });
    expect(asked).toEqual([{ slug: "app:f00d", records: true }]);
  });

  it("says it changed, and when the copy was taken", async () => {
    await writeRecord(record());
    retaken = ok("sha256:now");
    expect((await statusOf()).body).toEqual({ status: "changed", takenAt: TAKEN_AT });
  });

  it.each([{ kind: "unknown" }, { kind: "signed-out" }, { kind: "too-large", bytes: 1 }, { kind: "not-a-reader", collections: ["x"] }] satisfies Snapshot[])(
    "says it cannot take the source again when the snapshot is $kind",
    async (snapshot) => {
      await writeRecord(record());
      retaken = snapshot;
      expect((await statusOf()).body).toEqual({ status: "unreadable", reason: snapshot.kind });
    },
  );

  it.each([
    ["no source.json", null],
    ["a copy from before the fingerprint", record({ fingerprint: undefined })],
    ["a source.json that is not JSON", "{"],
    ["a source.json grown past what the copy writes", record({ padding: "x".repeat(70 * 1024) })],
  ])("has nothing to compare for %s, and takes nothing again", async (_label, content) => {
    if (content !== null) await writeRecord(content);
    retaken = ok("sha256:now");
    expect((await statusOf()).body).toEqual({ status: "unknown" });
    expect(asked).toEqual([]);
  });

  it("refuses a build it does not know", async () => {
    expect((await statusOf("run-00000009")).status).not.toBe(200);
  });
});
