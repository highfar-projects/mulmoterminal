// @vitest-environment node
// The routes against a fake executor, over real HTTP: what reaches the executor, and how each
// refusal comes back.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { z } from "zod";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import { BlueprintRefusal, type BlueprintExecutor } from "../../../server/blueprint/executor";
import { englishRefusal, refusalSchema, type Refusal } from "../../../common/blueprint/refusal";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const calls: unknown[][] = [];
const trusted = new Set<string>([tmpdir()]);
// No test here asks for a folder suggestion; the new-folder routes have their own spec.
const WORKSPACE = tmpdir();
let ownerRefusal: string | Refusal | null = null;
let busyRun: string | null = null;
const askedFolders: string[] = [];
const createdAnswers: unknown[] = [];
const createdLanguages: unknown[] = [];
const snapshotAsks: { slug: string; records: boolean }[] = [];
const PEOPLE_EMAIL = { collection: "people", field: "email", label: "Email" };

const executor: BlueprintExecutor = {
  create: async (request) => {
    calls.push(["create", request.projectDir, request.steps.length]);
    createdAnswers.push(request.answers ?? {});
    createdLanguages.push(request.language);
    return "run-00000001";
  },
  view: async (runId) => {
    throw new BlueprintRefusal(`no blueprint run ${runId}`);
  },
  humanEvent: async (runId, stepId, event) => {
    calls.push(["event", runId, stepId, event]);
    if (stepId === "refused") throw new BlueprintRefusal("cannot approve a step that is pending");
    throw new Error("unexpected");
  },
  ask: async (runId, stepId, question, sessionId, choices) => {
    calls.push(["ask", runId, stepId, question, sessionId, choices]);
    throw new BlueprintRefusal("no agent is working on this build");
  },
  list: async () => [],
  workingIn: async (folder) => {
    askedFolders.push(folder);
    return busyRun;
  },
  specView: async () => ({ spec: "# spec", openQuestions: null, chat: [], revising: false }),
  reportView: async (runId) => {
    if (runId !== "run-1") throw new BlueprintRefusal(`no blueprint run ${runId}`);
    return {
      path: "/p/.blueprint/review-report.md",
      markdown: "## 見つけたこと",
      changed: { files: ["contract.proposed.txt"], more: false },
      pair: { base: "docs", usecase: "review" },
    };
  },
  say: async (runId, message) => {
    calls.push(["say", runId, message]);
    throw new BlueprintRefusal("the spec can be discussed only while it waits for review");
  },
  archive: async (runId, archived) => {
    calls.push(["archive", runId, archived]);
    throw new BlueprintRefusal({ code: "agent-working" });
  },
  recover: async () => undefined,
};

// Every required question of the internal pack, answered: what a filled-in form sends.
const ANSWERS = {
  appName: "Leave requests",
  appPurpose: "Staff request leave; approvers approve it.",
  domain: "example.co.jp",
  workspace: true,
  external: false,
  users: 40,
  roles: ["一般", "承認者"],
  dataSensitivity: "個人情報を含む",
  region: "asia-northeast1（東京）",
  offboarding: true,
  existingProject: false,
  billingAccount: true,
  budget: 10000,
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
    workspace: WORKSPACE,
    home: WORKSPACE,
    savedFolders: () => [],
    collections: {
      list: async () => [{ slug: "books", title: "Books", kind: "collection" }],
      snapshot: async (slug, nowMs, records) => {
        snapshotAsks.push({ slug, records });
        if (slug === "huge" || slug === "app:huge") return { kind: "too-large", bytes: 300 * 1024 * 1024 };
        if (slug === "app:signed-out") return { kind: "signed-out" };
        if (slug === "app:partial") return { kind: "not-a-reader", collections: ["ballots", "topics"] };
        const files = [{ path: ".blueprint/source/source.json", content: `{"takenAtMs":${nowMs}}` }];
        if (slug === "people") return { kind: "ok", files, personal: { fields: [PEOPLE_EMAIL], members: 2 }, fingerprint: "sha256:people" };
        return slug === "books" ? { kind: "ok", files, personal: { fields: [], members: 0 }, fingerprint: "sha256:books" } : { kind: "unknown" };
      },
    },
    ensureOwner: async () => {
      if (ownerRefusal) throw new BlueprintRefusal(ownerRefusal);
    },
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

describe("POST /api/blueprints/runs", () => {
  it("starts a build of a real pack pair in a trusted directory", async () => {
    calls.length = 0;
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-route-"));
    trusted.add(project);
    const res = await post("/api/blueprints/runs", { projectDir: project, base: "firebase", usecase: "internal", answers: { ...ANSWERS, stray: "x" } });
    expect(res).toEqual({ status: 200, body: { runId: "run-00000001" } });
    expect(calls[0]?.[0]).toBe("create");
    // Only answers to questions that were asked reach the build (the executor writes them when a session starts).
    expect(createdAnswers.at(-1)).toEqual(ANSWERS);
    await rm(project, { recursive: true, force: true });
  });

  it("refuses on a server that does not drive the runs, before writing anything into the project", async () => {
    calls.length = 0;
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-route-"));
    trusted.add(project);
    const refusal: Refusal = { code: "held-elsewhere", port: "34567" };
    ownerRefusal = refusal;
    try {
      const res = await post("/api/blueprints/runs", { projectDir: project, base: "firebase", usecase: "internal", answers: ANSWERS });
      expect(res).toEqual({ status: 409, body: { error: englishRefusal(refusal), refusal } });
      expect(calls).toEqual([]);
      await expect(readFile(path.join(project, ".blueprint", "answers.json"), "utf8")).rejects.toThrow();
    } finally {
      ownerRefusal = null;
      await rm(project, { recursive: true, force: true });
    }
  });

  it("names the questions left unanswered", async () => {
    const rest = Object.fromEntries(Object.entries(ANSWERS).filter(([id]) => id !== "appName"));
    const res = await post("/api/blueprints/runs", { projectDir: tmpdir(), base: "firebase", usecase: "internal", answers: rest });
    expect(res).toEqual({ status: 400, body: { error: "unanswered: appName" } });
  });

  it.each([
    ["a choice the question does not offer", { region: "mars-1" }, "invalid: region: expects one of its options"],
    ["text where a number is asked", { users: "forty" }, "invalid: users: expects a number"],
    ["an unknown role", { roles: ["一般", "superuser"] }, "invalid: roles: expects some of its options"],
  ])("refuses %s", async (_label, patch, error) => {
    const res = await post("/api/blueprints/runs", { projectDir: tmpdir(), base: "firebase", usecase: "internal", answers: { ...ANSWERS, ...patch } });
    expect(res).toEqual({ status: 400, body: { error } });
  });

  it("asks a conditional question once its condition holds", async () => {
    const res = await post("/api/blueprints/runs", { projectDir: tmpdir(), base: "firebase", usecase: "internal", answers: { ...ANSWERS, external: true } });
    expect(res).toEqual({ status: 400, body: { error: "unanswered: externalWho" } });
  });

  // The refusals a person can meet carry a code the UI words in their language; the rest are only English.
  it.each([
    ["a relative directory", { projectDir: "app", base: "firebase", usecase: "internal", answers: ANSWERS }, 400, "not-absolute"],
    ["the filesystem root", { projectDir: "/", base: "firebase", usecase: "internal", answers: ANSWERS }, 400, "not-absolute"],
    [
      "a folder whose parent does not exist either",
      { projectDir: path.join(tmpdir(), "no-such-dir-xyz", "deeper"), base: "firebase", usecase: "internal", answers: ANSWERS },
      400,
      "no-parent",
    ],
    [
      "a new folder in a place Claude Code does not trust",
      { projectDir: path.join(tmpdir(), "no-such-dir-xyz"), base: "firebase", usecase: "internal", answers: ANSWERS },
      409,
      "untrusted",
    ],
    [
      "a file where the folder should be",
      { projectDir: path.join(import.meta.dirname, "routes.spec.ts"), base: "firebase", usecase: "internal", answers: ANSWERS },
      400,
      "not-a-directory",
    ],
    ["a slug with a path in it", { projectDir: tmpdir(), base: "../firebase", usecase: "internal", answers: ANSWERS }, 400, undefined],
    ["a usecase on a base it does not support", { projectDir: tmpdir(), base: "internal", usecase: "firebase", answers: ANSWERS }, 400, undefined],
    ["no answers at all", { projectDir: tmpdir(), base: "firebase", usecase: "internal" }, 400, undefined],
    // A directory that exists and is not the root on every platform: on Linux, dirname(tmpdir()) is "/", which is refused for being the root.
    ["a directory Claude Code does not trust", { projectDir: import.meta.dirname, base: "firebase", usecase: "internal", answers: ANSWERS }, 409, "untrusted"],
  ])("refuses %s", async (_label, body, status, code) => {
    const res = await post("/api/blueprints/runs", body);
    expect(res.status).toBe(status);
    const { error, refusal } = z.object({ error: z.string(), refusal: refusalSchema.optional() }).parse(res.body);
    expect(refusal?.code).toBe(code);
    if (refusal) expect(error).toBe(englishRefusal(refusal));
  });
});

describe("GET /api/blueprints/runs/:id/report", () => {
  it("returns the finished build's report, and refuses an unknown run", async () => {
    expect(await (await fetch(`${base}/api/blueprints/runs/run-1/report`)).json()).toEqual({
      path: "/p/.blueprint/review-report.md",
      markdown: "## 見つけたこと",
      changed: { files: ["contract.proposed.txt"], more: false },
      pair: { base: "docs", usecase: "review" },
    });
    expect((await fetch(`${base}/api/blueprints/runs/run-9/report`)).status).not.toBe(200);
  });
});

describe("the spec conversation routes", () => {
  it("reads the spec", async () => {
    const res = await fetch(`${base}/api/blueprints/runs/run-00000001/spec`);
    expect(await res.json()).toEqual({ spec: "# spec", openQuestions: null, chat: [], revising: false });
  });

  it("passes a message on, trimmed, and answers a refusal with 409", async () => {
    calls.length = 0;
    const res = await post("/api/blueprints/runs/run-00000001/spec/messages", { message: "  本の削除も入れて  " });
    expect(res.status).toBe(409);
    expect(calls).toEqual([["say", "run-00000001", "本の削除も入れて"]]);
  });

  it("refuses an empty message", async () => {
    expect((await post("/api/blueprints/runs/run-00000001/spec/messages", { message: "   " })).status).toBe(400);
  });

  it("passes the archive flag on, and answers a refusal with 409", async () => {
    calls.length = 0;
    const res = await post("/api/blueprints/runs/run-00000001/archive", { archived: true });
    expect(res.status).toBe(409);
    expect(calls).toEqual([["archive", "run-00000001", true]]);
  });

  it("refuses an archive request without a boolean, before reaching the build", async () => {
    calls.length = 0;
    expect((await post("/api/blueprints/runs/run-00000001/archive", { archived: "yes" })).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("POST /api/blueprints/runs in a folder another build uses", () => {
  const REVIEW_ANSWERS = { documents: "contract.txt", kind: "契約書", focus: "", proposals: "指摘だけ" };

  it("refuses while another build is working in the folder, before writing anything", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-busy-"));
    trusted.add(project);
    askedFolders.length = 0;
    busyRun = "run-00000009";
    try {
      const res = await post("/api/blueprints/runs", { projectDir: project, base: "docs", usecase: "review", answers: REVIEW_ANSWERS });
      expect(res).toEqual({
        status: 409,
        body: { error: expect.stringContaining("run-00000009"), refusal: { code: "folder-busy", dir: project, runId: "run-00000009" } },
      });
      expect(askedFolders).toEqual([project]);
      await expect(readFile(path.join(project, ".blueprint", "answers.json"), "utf8")).rejects.toThrow();
    } finally {
      busyRun = null;
      await rm(project, { recursive: true, force: true });
    }
  });

  it("hands the answers to the build it creates", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-busy-"));
    trusted.add(project);
    try {
      expect((await post("/api/blueprints/runs", { projectDir: project, base: "docs", usecase: "review", answers: REVIEW_ANSWERS })).status).toBe(200);
      expect(createdAnswers.at(-1)).toEqual(REVIEW_ANSWERS);
      expect(createdLanguages.at(-1)).toBeUndefined();
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("hands the screen's language to the build, and refuses one it does not know before creating anything", async () => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-language-"));
    trusted.add(project);
    try {
      const body = { projectDir: project, base: "docs", usecase: "review", answers: REVIEW_ANSWERS };
      expect((await post("/api/blueprints/runs", { ...body, language: "en" })).status).toBe(200);
      expect(createdLanguages.at(-1)).toBe("en");
      const before = createdLanguages.length;
      expect((await post("/api/blueprints/runs", { ...body, language: "fr" })).status).toBe(400);
      expect(createdLanguages).toHaveLength(before);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("POST /api/blueprints/runs that leaves out a question with a default", () => {
  const POLISH = { targets: "a.md", style: "chaff の既定のまま" };
  // The kind is asked with chaff's own style, and a start that leaves it out takes its default.
  const LEFT_TO_CHAFF = "指定しない（chaff に任せる）";

  const createdWith = async (answers: Record<string, unknown>) => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-defaults-"));
    trusted.add(project);
    try {
      const res = await post("/api/blueprints/runs", { projectDir: project, base: "docs", usecase: "polish", answers });
      return { status: res.status, answers: createdAnswers.at(-1) };
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  };

  it("starts with a required question's default, and with the answer given when there is one", async () => {
    expect(await createdWith(POLISH)).toEqual({ status: 200, answers: { ...POLISH, kind: LEFT_TO_CHAFF, maxFiles: 5 } });
    expect(await createdWith({ ...POLISH, maxFiles: 2 })).toEqual({ status: 200, answers: { ...POLISH, kind: LEFT_TO_CHAFF, maxFiles: 2 } });
    expect(await createdWith({ ...POLISH, kind: "報告書" })).toEqual({ status: 200, answers: { ...POLISH, kind: "報告書", maxFiles: 5 } });
  });

  it("leaves a blank optional question blank", async () => {
    expect((await createdWith({ ...POLISH, avoid: "" })).answers).toEqual({ ...POLISH, kind: LEFT_TO_CHAFF, maxFiles: 5, avoid: "" });
  });
});

describe("POST /api/blueprints/runs from an example that brings sample documents", () => {
  const REVIEW_ANSWERS = { documents: "contract.txt", kind: "契約書", focus: "", proposals: "指摘だけ" };
  const SAMPLE = path.join(PACKS_ROOT, "review", "presets", "itaku-keiyaku", "contract.txt");
  const startIn = (project: string, preset?: string) =>
    post("/api/blueprints/runs", { projectDir: project, base: "docs", usecase: "review", answers: REVIEW_ANSWERS, ...(preset ? { preset } : {}) });
  const emptyTrusted = async () => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-sample-"));
    trusted.add(project);
    return project;
  };

  it("places the samples in an empty folder, then starts", async () => {
    const project = await emptyTrusted();
    try {
      expect((await startIn(project, "itaku-keiyaku")).status).toBe(200);
      expect(await readFile(path.join(project, "contract.txt"), "utf8")).toBe(await readFile(SAMPLE, "utf8"));
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("leaves a file that is already the sample alone", async () => {
    const project = await emptyTrusted();
    try {
      await writeFile(path.join(project, "contract.txt"), await readFile(SAMPLE, "utf8"));
      expect((await startIn(project, "itaku-keiyaku")).status).toBe(200);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses when the folder has another file of the same name, and writes nothing", async () => {
    const project = await emptyTrusted();
    try {
      await writeFile(path.join(project, "contract.txt"), "the person's own contract");
      const res = await startIn(project, "itaku-keiyaku");
      expect(res).toEqual({
        status: 409,
        body: { error: expect.stringContaining("other files named contract.txt"), refusal: { code: "samples-clash", files: ["contract.txt"] } },
      });
      expect(await readFile(path.join(project, "contract.txt"), "utf8")).toBe("the person's own contract");
      await expect(readFile(path.join(project, ".blueprint", "answers.json"), "utf8")).rejects.toThrow();
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses an example the usecase does not have", async () => {
    const project = await emptyTrusted();
    try {
      const res = await startIn(project, "no-such-example");
      expect(res).toEqual({ status: 400, body: { error: 'review has no example "no-such-example" on docs' } });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses an example written for another base of the same usecase", async () => {
    const project = await emptyTrusted();
    try {
      const presets = z
        .object({ presets: z.array(z.object({ id: z.string(), answers: z.record(z.string(), z.unknown()) })) })
        .parse(JSON.parse(await readFile(path.join(PACKS_ROOT, "product", "presets.json"), "utf8")));
      const local = presets.presets.find((preset) => preset.id === "home-library");
      const body = { projectDir: project, base: "local", usecase: "product", answers: local?.answers, preset: "mini-sns" };
      expect(await post("/api/blueprints/runs", body)).toEqual({ status: 400, body: { error: 'product has no example "mini-sns" on local' } });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("places nothing without a preset", async () => {
    const project = await emptyTrusted();
    try {
      expect((await startIn(project)).status).toBe(200);
      await expect(readFile(path.join(project, "contract.txt"), "utf8")).rejects.toThrow();
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("POST /api/blueprints/runs from a collection", () => {
  const FROM_ANSWERS = {
    source: "books",
    copyRecords: false,
    whyApp: "to own it as code",
    audience: "自分だけ",
    signIn: "なし（このパソコンからだけ使う）",
    dataSensitivity: "身内だけの情報",
    uiLanguage: "日本語",
  };
  const startFrom = (project: string, source: string) =>
    post("/api/blueprints/runs", { projectDir: project, base: "local", usecase: "from-collection", answers: { ...FROM_ANSWERS, source } });
  const emptyTrusted = async () => {
    const project = await mkdtemp(path.join(tmpdir(), "blueprint-source-"));
    trusted.add(project);
    return project;
  };

  it("lists the collections a build may start from", async () => {
    const res = await fetch(`${base}/api/blueprints/collections`);
    expect(await res.json()).toEqual({ collections: [{ slug: "books", title: "Books", kind: "collection" }] });
  });

  it("places the copy of the chosen collection, taken at the server's clock, then starts", async () => {
    const project = await emptyTrusted();
    try {
      expect((await startFrom(project, "books")).status).toBe(200);
      expect(await readFile(path.join(project, ".blueprint/source/source.json"), "utf8")).toBe('{"takenAtMs":42}');
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("records the slug it copied, without the spaces around the answer", async () => {
    const project = await emptyTrusted();
    try {
      expect((await startFrom(project, "  books ")).status).toBe(200);
      expect(createdAnswers.at(-1)).toMatchObject({ source: "books" });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("asks for the records only when the answer says to copy them", async () => {
    const project = await emptyTrusted();
    try {
      await post("/api/blueprints/runs", { projectDir: project, base: "local", usecase: "from-collection", answers: { ...FROM_ANSWERS, copyRecords: true } });
      expect(snapshotAsks.at(-1)).toEqual({ slug: "books", records: true });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
    const other = await emptyTrusted();
    try {
      await startFrom(other, "books");
      expect(snapshotAsks.at(-1)).toEqual({ slug: "books", records: false });
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("refuses a copy too large to take, saying how large and what to do instead", async () => {
    const project = await emptyTrusted();
    try {
      expect(await startFrom(project, "huge")).toEqual({
        status: 400,
        body: { error: expect.stringMatching(/"huge" with its records would be 300 MB, more than the 200 MB.*without the records/) },
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("asks once before copying personal data, placing nothing, and starts once it is confirmed", async () => {
    const project = await emptyTrusted();
    const before = calls.length;
    try {
      const asked = await startFrom(project, "people");
      expect(asked).toEqual({
        status: 409,
        body: {
          error: expect.stringContaining("people.email (Email), the email addresses of the app's 2 members"),
          refusal: { code: "personal-data", fields: [PEOPLE_EMAIL], members: 2 },
        },
      });
      expect(calls).toHaveLength(before);
      await expect(readFile(path.join(project, ".blueprint/source/source.json"), "utf8")).rejects.toThrow();
      const answers = { ...FROM_ANSWERS, source: "people" };
      const confirmed = await post("/api/blueprints/runs", {
        projectDir: project,
        base: "local",
        usecase: "from-collection",
        answers,
        personalDataConfirmed: true,
      });
      expect(confirmed.status).toBe(200);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses an app that is no longer offered without showing its id", async () => {
    const project = await emptyTrusted();
    try {
      expect(await startFrom(project, "app:gone0123")).toEqual({
        status: 400,
        body: { error: "that shared app is no longer offered; choose another source from the list" },
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("names a shared app too large to copy without its id", async () => {
    const project = await emptyTrusted();
    try {
      const res = await startFrom(project, "app:huge");
      expect(res).toEqual({ status: 400, body: { error: expect.stringContaining("the copy of the shared app with its records would be 300 MB") } });
      expect(res.body).toEqual({ error: expect.not.stringContaining("app:huge") });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it.each([
    ["app:signed-out", "press Connect to sign in with Google"],
    ["app:partial", "does not read every record of ballots, topics"],
  ])("refuses to copy %s's records, and says what to do", async (source, message) => {
    const project = await emptyTrusted();
    try {
      expect(await startFrom(project, source)).toEqual({ status: 409, body: { error: expect.stringContaining(message) } });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses a collection it does not know, before creating anything", async () => {
    const project = await emptyTrusted();
    const before = calls.length;
    try {
      expect(await startFrom(project, "nope")).toEqual({ status: 400, body: { error: expect.stringContaining('no collection "nope"') } });
      expect(calls).toHaveLength(before);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses over an earlier copy, and leaves it as it was", async () => {
    const project = await emptyTrusted();
    try {
      expect((await startFrom(project, "books")).status).toBe(200);
      await writeFile(path.join(project, ".blueprint/source/source.json"), "earlier");
      expect(await startFrom(project, "books")).toEqual({
        status: 409,
        body: { error: expect.any(String), refusal: { code: "samples-clash", files: [".blueprint/source/source.json"] } },
      });
      expect(await readFile(path.join(project, ".blueprint/source/source.json"), "utf8")).toBe("earlier");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("POST /api/blueprints/runs/:id/events and /ask", () => {
  it("stamps an answer with the server's clock", async () => {
    calls.length = 0;
    await post("/api/blueprints/runs/run-00000001/events", { type: "answer", stepId: "x", answer: "Tokyo" });
    expect(calls).toEqual([["event", "run-00000001", "x", { type: "answer", answer: "Tokyo", atMs: 42 }]]);
  });

  it.each([
    ["an agent-only event", { type: "ask", stepId: "x", question: "q" }],
    ["a check result", { type: "check", stepId: "x", ok: true }],
    ["a reject with no reason", { type: "reject", stepId: "x" }],
    ["a reject whose reason is only spaces", { type: "reject", stepId: "x", reason: "   " }],
    ["an answer that is only spaces", { type: "answer", stepId: "x", answer: "  " }],
  ])("refuses %s on /events", async (_label, body) => {
    expect((await post("/api/blueprints/runs/run-00000001/events", body)).status).toBe(400);
  });

  it("answers a rule refusal with 409 and the reason", async () => {
    expect(await post("/api/blueprints/runs/run-00000001/events", { type: "approve", stepId: "refused" })).toEqual({
      status: 409,
      body: { error: "cannot approve a step that is pending" },
    });
  });

  it("answers 409 to a question nobody is working on", async () => {
    expect((await post("/api/blueprints/runs/run-00000001/ask", { stepId: "x", sessionId: "s1", question: "q" })).status).toBe(409);
  });

  it("hands the executor the parsed choices, the recommended one marked", async () => {
    calls.length = 0;
    await post("/api/blueprints/runs/run-00000001/ask", {
      stepId: "x",
      sessionId: "s1",
      question: "q",
      choices: "Fix: cheap\nLeave: free",
      recommend: "Leave",
    });
    expect(calls).toEqual([
      [
        "ask",
        "run-00000001",
        "x",
        "q",
        "s1",
        [
          { label: "Fix", description: "cheap" },
          { label: "Leave", description: "free", recommended: true },
        ],
      ],
    ]);
  });

  it("refuses choices it cannot read with 400 and the reason, before asking anyone", async () => {
    calls.length = 0;
    expect(await post("/api/blueprints/runs/run-00000001/ask", { stepId: "x", sessionId: "s1", question: "q", choices: "A\nB", recommend: "C" })).toEqual({
      status: 400,
      body: { error: 'not asked: RECOMMEND "C" is not one of the choices\' labels' },
    });
    expect(calls).toEqual([]);
  });

  it("answers 409 for a run that does not exist", async () => {
    expect((await fetch(`${base}/api/blueprints/runs/run-00000404`)).status).toBe(409);
  });
});
