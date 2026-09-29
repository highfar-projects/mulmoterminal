// @vitest-environment node
// Starting a build in a folder that does not exist yet, and the folder the form suggests for an example: over real
// HTTP, with a fake executor and a fake trust that trusts what is under a trusted parent, as Claude Code does.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { z } from "zod";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import type { BlueprintExecutor } from "../../../server/blueprint/executor";
import type { BlueprintRunSummary } from "../../../common/blueprint/run";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const SAMPLE = path.join(PACKS_ROOT, "review", "presets", "itaku-keiyaku", "contract.txt");
const REVIEW_ANSWERS = { documents: "contract.txt", kind: "契約書", focus: "", proposals: "指摘だけ" };

let root = "";
let trustedParent = "";
let untrustedParent = "";
let workspace = "";
const created: string[] = [];
const failures = { create: false };
const recent: { runs: BlueprintRunSummary[] } = { runs: [] };
const saved: { folders: string[] } = { folders: [] };

const unused = (): never => {
  throw new Error("not used here");
};
const executor: BlueprintExecutor = {
  create: async (request) => {
    if (failures.create) throw new Error("the store is full");
    created.push(request.projectDir);
    return "run-00000001";
  },
  list: async () => recent.runs,
  workingIn: async () => null,
  view: unused,
  humanEvent: unused,
  ask: unused,
  specView: unused,
  reportView: unused,
  say: unused,
  recover: async () => undefined,
};

const summary = (projectDir: string): BlueprintRunSummary => ({
  id: "run-1",
  projectDir,
  createdAtMs: 1,
  current: null,
  waitingOn: null,
  passed: 1,
  total: 1,
  usecaseTitle: null,
});
const under = (dir: string, parent: string): boolean => dir === parent || dir.startsWith(`${parent}${path.sep}`);

let server: Server;
let base = "";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-new-folder-"));
  trustedParent = path.join(root, "trusted");
  untrustedParent = path.join(root, "untrusted");
  workspace = path.join(root, "workspace");
  await Promise.all([trustedParent, untrustedParent, workspace].map((dir) => mkdir(dir)));
  const app = express();
  app.use(express.json());
  mountBlueprintRoutes(app, {
    executor,
    packRoots: [{ dir: PACKS_ROOT, source: "builtin" }],
    now: () => 42,
    isTrusted: async (dir) => {
      // Another start making the same folder in the moment between the checks and this one's mkdir.
      if (path.basename(dir) === "raced") await mkdir(dir, { recursive: true });
      return under(dir, trustedParent) || under(dir, workspace);
    },
    workspace,
    home: trustedParent,
    savedFolders: () => saved.folders,
    collections: { list: async () => [], snapshot: async () => ({ kind: "unknown" }) },
    ensureOwner: async () => undefined,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  created.length = 0;
  failures.create = false;
  recent.runs = [];
  saved.folders = [];
});

const start = async (projectDir: string, preset: string | null = "itaku-keiyaku") => {
  const res = await fetch(`${base}/api/blueprints/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectDir, base: "docs", usecase: "review", answers: REVIEW_ANSWERS, ...(preset === null ? {} : { preset }) }),
  });
  return {
    status: res.status,
    body: z
      .object({ refusal: z.object({ code: z.string() }).passthrough().optional() })
      .passthrough()
      .parse(await res.json()),
  };
};
const exists = (dir: string): Promise<boolean> =>
  readdir(dir).then(
    () => true,
    () => false,
  );

describe("starting a build in a folder that does not exist yet", () => {
  it("makes it inside its existing parent, places the samples, and starts", async () => {
    const dir = path.join(trustedParent, "first");
    expect((await start(dir)).status).toBe(200);
    expect(await readFile(path.join(dir, "contract.txt"), "utf8")).toBe(await readFile(SAMPLE, "utf8"));
    expect(created).toEqual([dir]);
  });

  it("reads a leading ~ as the home folder, as the guide writes it, and records the full path", async () => {
    expect((await start("~/from-home")).status).toBe(200);
    expect(created).toEqual([path.join(trustedParent, "from-home")]);
    expect(await exists(path.join(trustedParent, "from-home"))).toBe(true);
  });

  it("refuses when the parent is missing too, and makes nothing", async () => {
    const dir = path.join(trustedParent, "missing", "deeper");
    expect(await start(dir)).toMatchObject({ status: 400, body: { refusal: { code: "no-parent", dir: path.join(trustedParent, "missing") } } });
    expect(await exists(path.join(trustedParent, "missing"))).toBe(false);
  });

  it("refuses a folder whose .blueprint is a link out of it, or a file, and writes nothing", async () => {
    const outside = path.join(root, "outside-records");
    await mkdir(outside, { recursive: true });
    const linked = path.join(trustedParent, "linked-records");
    await mkdir(linked);
    await symlink(outside, path.join(linked, ".blueprint"));
    expect(await start(linked)).toMatchObject({ status: 409, body: { refusal: { code: "record-folder-not-real", dir: linked } } });
    expect(await readdir(outside)).toEqual([]);
    const filed = path.join(trustedParent, "filed-records");
    await mkdir(filed);
    await writeFile(path.join(filed, ".blueprint"), "x");
    expect(await start(filed)).toMatchObject({ status: 409, body: { refusal: { code: "record-folder-not-real", dir: filed } } });
    expect(created).toEqual([]);
    expect(await readdir(filed)).toEqual([".blueprint"]);
  });

  it("refuses a folder Claude Code does not trust, naming that folder as the place to answer its prompt", async () => {
    expect(await start(untrustedParent)).toMatchObject({
      status: 409,
      body: { refusal: { code: "untrusted", dir: untrustedParent, trustIn: untrustedParent } },
    });
  });

  it("refuses a new folder Claude Code would not trust, before making it", async () => {
    const dir = path.join(untrustedParent, "new");
    expect(await start(dir)).toMatchObject({ status: 409, body: { refusal: { code: "untrusted", dir, trustIn: untrustedParent } } });
    expect(await exists(dir)).toBe(false);
  });

  it("refuses, and touches nothing, when another start made the same folder a moment before", async () => {
    const dir = path.join(trustedParent, "raced");
    expect(await start(dir)).toMatchObject({ status: 409, body: { refusal: { code: "folder-taken", dir } } });
    expect(await readdir(dir)).toEqual([]);
    expect(created).toEqual([]);
  });

  it("takes back the folder it made, while empty, when the build cannot be created", async () => {
    failures.create = true;
    const dir = path.join(trustedParent, "taken-back");
    expect((await start(dir, null)).status).toBe(500);
    expect(await exists(dir)).toBe(false);
  });

  it("deletes no file when the build cannot be created: the sample it placed stays, and the folder with it", async () => {
    failures.create = true;
    const dir = path.join(trustedParent, "sample-stays");
    expect((await start(dir)).status).toBe(500);
    expect(await readdir(dir)).toEqual(["contract.txt"]);
    failures.create = false;
    expect((await start(dir)).status).toBe(200);
  });

  it("leaves the folder when something else appeared in it meanwhile", async () => {
    failures.create = true;
    const dir = path.join(trustedParent, "kept");
    const original = executor.create;
    executor.create = async (request) => {
      await writeFile(path.join(request.projectDir, "theirs.txt"), "not ours");
      return original(request);
    };
    try {
      expect((await start(dir)).status).toBe(500);
      expect((await readdir(dir)).sort()).toEqual(["contract.txt", "theirs.txt"]);
    } finally {
      executor.create = original;
    }
  });
});

describe("taking back a folder it made", () => {
  it("leaves a sample that was rewritten meanwhile", async () => {
    failures.create = true;
    const dir = path.join(trustedParent, "rewritten");
    const original = executor.create;
    executor.create = async (request) => {
      await writeFile(path.join(request.projectDir, "contract.txt"), "someone else's contract");
      return original(request);
    };
    try {
      expect((await start(dir)).status).toBe(500);
      expect(await readFile(path.join(dir, "contract.txt"), "utf8")).toBe("someone else's contract");
    } finally {
      executor.create = original;
    }
  });
});

describe("the folder suggested for an example", () => {
  const suggest = async (name: string) => {
    const res = await fetch(`${base}/api/blueprints/folder-suggestion?name=${encodeURIComponent(name)}`);
    return { status: res.status, body: await res.json() };
  };

  it("is a free name beside the most recent build, when that place is trusted", async () => {
    recent.runs = [summary(path.join(trustedParent, "earlier-build")), summary(path.join(workspace, "older"))];
    expect(await suggest("osaka-kyoto")).toEqual({ status: 200, body: { path: path.join(trustedParent, "osaka-kyoto") } });
    await mkdir(path.join(trustedParent, "osaka-kyoto"));
    expect((await suggest("osaka-kyoto")).body).toEqual({ path: path.join(trustedParent, "osaka-kyoto-2") });
  });

  it("passes over a place Claude Code would not trust, down to the workspace", async () => {
    recent.runs = [summary(path.join(untrustedParent, "earlier"))];
    expect((await suggest("keihi")).body).toEqual({ path: path.join(workspace, "keihi") });
  });

  it("is null when no place is trusted, and refuses a name that is not a slug", async () => {
    recent.runs = [summary(path.join(untrustedParent, "earlier"))];
    await rm(workspace, { recursive: true, force: true });
    try {
      expect((await suggest("keihi")).body).toEqual({ path: null });
    } finally {
      await mkdir(workspace);
    }
    expect((await suggest("../escape")).status).toBe(400);
  });
});

describe("the files a question may pick from", () => {
  const filesIn = async (dir: string) => {
    const res = await fetch(`${base}/api/blueprints/folder-files?dir=${encodeURIComponent(dir)}`);
    return { status: res.status, body: await res.json() };
  };

  it("lists the folder's files in order, leaving out hidden ones, and reads ~ as the home folder", async () => {
    const dir = path.join(trustedParent, "picking");
    await mkdir(path.join(dir, "notes"), { recursive: true });
    await mkdir(path.join(dir, ".blueprint"), { recursive: true });
    await Promise.all(["b.md", "a.txt", "notes/c.md", ".blueprint/answers.json"].map((file) => writeFile(path.join(dir, file), "")));
    expect(await filesIn(dir)).toEqual({ status: 200, body: { files: ["a.txt", "b.md", "notes/c.md"], more: false } });
    expect((await filesIn("~/picking")).body).toEqual({ files: ["a.txt", "b.md", "notes/c.md"], more: false });
  });

  it("has none for a folder not made yet, and refuses a relative path or a root", async () => {
    expect(await filesIn(path.join(trustedParent, "not-yet"))).toEqual({ status: 200, body: { files: [], more: false } });
    await writeFile(path.join(trustedParent, "a-file.txt"), "");
    expect(await filesIn(path.join(trustedParent, "a-file.txt"))).toEqual({ status: 200, body: { files: [], more: false } });
    expect((await filesIn("relative/dir")).status).toBe(400);
    expect((await filesIn(path.parse(trustedParent).root)).status).toBe(400);
  });
});

describe("the folders the form offers to pick", () => {
  const known = async (): Promise<string[]> =>
    z.object({ folders: z.array(z.string()) }).parse(await (await fetch(`${base}/api/blueprints/known-folders`)).json()).folders;

  it("gives the recent builds' folders, then the saved ones, each once, leaving out what is not a folder now", async () => {
    const aFile = path.join(root, "a-file.txt");
    await writeFile(aFile, "x");
    recent.runs = [summary(trustedParent), summary(path.join(root, "gone")), summary(workspace)];
    saved.folders = [workspace, untrustedParent, aFile, "relative/dir"];
    expect(await known()).toEqual([trustedParent, workspace, untrustedParent]);
  });

  it("is empty when there are no builds and nothing is saved", async () => {
    expect(await known()).toEqual([]);
  });
});
