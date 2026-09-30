// @vitest-environment node
// An option that needs a file in the folder, over real HTTP with a fake executor: a start that chose it where the file
// is missing is refused, a question the folder settles is answered, and the form can ask which files are there.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import type { BlueprintExecutor } from "../../../server/blueprint/executor";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const trusted = new Set<string>();
const createdAnswers: unknown[] = [];

const unused = (): never => {
  throw new Error("not used here");
};
const executor: BlueprintExecutor = {
  create: async (request) => {
    createdAnswers.push(request.answers ?? {});
    return "run-00000001";
  },
  list: async () => [],
  workingIn: async () => null,
  view: unused,
  humanEvent: unused,
  ask: unused,
  specView: unused,
  reportView: unused,
  say: unused,
  archive: unused,
  recover: async () => undefined,
};

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  mountBlueprintRoutes(app, {
    executor,
    packRoots: [{ dir: PACKS_ROOT, source: "builtin" }],
    now: () => 42,
    isTrusted: async (dir) => trusted.has(dir),
    workspace: tmpdir(),
    home: tmpdir(),
    savedFolders: () => [],
    collections: { list: async () => [], snapshot: async () => ({ kind: "unknown" }) },
    ensureOwner: async () => undefined,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

const post = async (route: string, body: unknown) => {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

describe("an option that needs a file in the folder", () => {
  const FOLDER_STYLE = "このフォルダの規約（STYLE.md と chaff.yaml）";
  const DEFAULT_STYLE = "chaff の既定のまま";

  const inFolder = async <T>(files: Record<string, string>, act: (project: string) => Promise<T>): Promise<T> => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-needs-"));
    trusted.add(project);
    try {
      await Promise.all(Object.entries(files).map(([file, content]) => writeFile(path.join(project, file), content)));
      return await act(project);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  };
  const present = async (query: string) => {
    const res = await fetch(`${base}/api/blueprints/folder-present?${query}`);
    return { status: res.status, body: await res.json() };
  };

  const start = (project: string, answers: Record<string, unknown>) =>
    post("/api/blueprints/runs", { projectDir: project, base: "docs", usecase: "polish", answers: { targets: "a.md", ...answers } });

  it("starts with the folder's rules only where chaff.yaml is", async () => {
    expect(
      (await inFolder({ "chaff.yaml": "genre: docs/readme\n" }, (dir) => start(dir, { style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" }))).status,
    ).toBe(200);
    const refused = await inFolder({ "STYLE.md": "# style\n" }, (dir) => start(dir, { style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" }));
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("chaff.yaml");
    const folderNamed = await inFolder({}, async (dir) => {
      await mkdir(path.join(dir, "chaff.yaml"));
      return start(dir, { style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" });
    });
    expect(folderNamed.status).toBe(400);
  });

  it("does not take a link for the file", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "blueprint-needs-outside-"));
    try {
      await writeFile(path.join(outside, "chaff.yaml"), "");
      const linked = (dir: string) => symlink(path.join(outside, "chaff.yaml"), path.join(dir, "chaff.yaml"));
      const started = await inFolder({}, async (dir) => {
        await linked(dir);
        return start(dir, { style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" });
      });
      expect(started.status).toBe(400);
      const found = await inFolder({}, async (dir) => {
        await linked(dir);
        return present(
          new URLSearchParams([
            ["dir", dir],
            ["file", "chaff.yaml"],
          ]).toString(),
        );
      });
      expect(found.body).toEqual({ present: [] });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("names the missing file even when the option it refuses would open more questions", async () => {
    // STYLE.md keeps the scope a choice, so the folder settles nothing the refused option opens.
    const refused = await inFolder({ "STYLE.md": "" }, (dir) => start(dir, { style: FOLDER_STYLE }));
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("chaff.yaml");
    expect(JSON.stringify(refused.body)).not.toContain("unanswered");
  });

  it("offers following the guide only where STYLE.md is", async () => {
    const GUIDE = "手引き（STYLE.md）の決まりにも合わせる";
    expect((await inFolder({ "chaff.yaml": "", "STYLE.md": "" }, (dir) => start(dir, { style: FOLDER_STYLE, scope: GUIDE }))).status).toBe(200);
    expect((await inFolder({ "chaff.yaml": "" }, (dir) => start(dir, { style: FOLDER_STYLE, scope: GUIDE }))).status).toBe(400);
    expect((await inFolder({ "chaff.yaml": "" }, (dir) => start(dir, { style: FOLDER_STYLE }))).status).toBe(200);
    expect(createdAnswers.at(-1)).toMatchObject({ style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" });
  });

  it("writes in the folder's style only where both STYLE.md and chaff.yaml are", async () => {
    const WRITE = { kind: "その他", topic: "t", audience: "a", points: "p", length: "短い（2,000 字・800 語くらいまで）" };
    const write = (dir: string, answers: Record<string, unknown>) =>
      post("/api/blueprints/runs", { projectDir: dir, base: "docs", usecase: "write", answers: { ...WRITE, ...answers } });
    expect((await inFolder({ "chaff.yaml": "", "STYLE.md": "" }, (dir) => write(dir, { style: FOLDER_STYLE }))).status).toBe(200);
    expect((await inFolder({ "chaff.yaml": "" }, (dir) => write(dir, { style: FOLDER_STYLE }))).status).toBe(400);
    expect((await inFolder({ "chaff.yaml": "" }, (dir) => write(dir, {}))).status).toBe(200);
    expect(createdAnswers.at(-1)).toMatchObject({ style: DEFAULT_STYLE });
  });

  // A folder it cannot look into is not a folder without the file: the form then offers every option.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("does not call a file absent when the folder cannot be read", async () => {
    const found = await inFolder({ "chaff.yaml": "" }, async (dir) => {
      await chmod(dir, 0o600);
      try {
        return await present(
          new URLSearchParams([
            ["dir", dir],
            ["file", "chaff.yaml"],
          ]).toString(),
        );
      } finally {
        await chmod(dir, 0o700);
      }
    });
    expect(found.status).toBe(500);
  });

  it("refuses the folder's rules for a folder it would make", async () => {
    const project = path.join(tmpdir(), `blueprint-needs-new-${process.pid}`);
    trusted.add(project);
    expect((await start(project, { style: FOLDER_STYLE, scope: "chaff が指摘した所だけ" })).status).toBe(400);
  });

  it("answers the question the folder settles, when the start leaves it out", async () => {
    expect((await inFolder({}, (dir) => start(dir, {}))).status).toBe(200);
    expect(createdAnswers.at(-1)).toMatchObject({ style: DEFAULT_STYLE });
    expect((await inFolder({ "chaff.yaml": "" }, (dir) => start(dir, {}))).status).toBe(400);
  });

  it("says which of the files asked about the folder has", async () => {
    const found = await inFolder({ "chaff.yaml": "", "STYLE.md": "" }, (dir) =>
      present(
        new URLSearchParams([
          ["dir", dir],
          ["file", "chaff.yaml"],
          ["file", "missing.yaml"],
        ]).toString(),
      ),
    );
    expect(found).toEqual({ status: 200, body: { present: ["chaff.yaml"] } });
    const none = await present(
      new URLSearchParams([
        ["dir", path.join(tmpdir(), "no-such-dir-xyz")],
        ["file", "chaff.yaml"],
      ]).toString(),
    );
    expect(none).toEqual({ status: 200, body: { present: [] } });
  });

  it.each([
    ["no file", new URLSearchParams([["dir", tmpdir()]])],
    [
      "a file out of the folder",
      new URLSearchParams([
        ["dir", tmpdir()],
        ["file", "../chaff.yaml"],
      ]),
    ],
    [
      "a relative folder",
      new URLSearchParams([
        ["dir", "app"],
        ["file", "chaff.yaml"],
      ]),
    ],
  ])("refuses to look for %s", async (_name, query) => {
    expect((await present(query.toString())).status).toBe(400);
  });
});
