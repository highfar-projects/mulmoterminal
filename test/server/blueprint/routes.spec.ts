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
let ownerRefusal: string | Refusal | null = null;
let busyRun: string | null = null;
const askedFolders: string[] = [];
const createdAnswers: unknown[] = [];

const executor: BlueprintExecutor = {
  create: async (request) => {
    calls.push(["create", request.projectDir, request.steps.length]);
    createdAnswers.push(request.answers ?? {});
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
  ask: async (runId, stepId, question, sessionId) => {
    calls.push(["ask", runId, stepId, question, sessionId]);
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
    return { path: "/p/.blueprint/review-report.md", markdown: "## 見つけたこと", written: { files: ["contract.proposed.txt"], more: false } };
  },
  say: async (runId, message) => {
    calls.push(["say", runId, message]);
    throw new BlueprintRefusal("the spec can be discussed only while it waits for review");
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
      "a directory that does not exist",
      { projectDir: path.join(tmpdir(), "no-such-dir-xyz"), base: "firebase", usecase: "internal", answers: ANSWERS },
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
      written: { files: ["contract.proposed.txt"], more: false },
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
    } finally {
      await rm(project, { recursive: true, force: true });
    }
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

describe("GET /api/blueprints/presets", () => {
  it("names the sample documents an example brings", async () => {
    const listing = z
      .object({ presets: z.array(z.object({ id: z.string(), usecase: z.string(), samples: z.array(z.string()) })) })
      .parse(await (await fetch(`${base}/api/blueprints/presets`)).json());
    expect(listing.presets).toContainEqual(expect.objectContaining({ id: "itaku-keiyaku", usecase: "review", samples: ["contract.txt"] }));
    expect(listing.presets).toContainEqual(expect.objectContaining({ id: "home-library", samples: [] }));
  });

  it("lists the shipped presets with the usecase each belongs to", async () => {
    const listing = z
      .object({ presets: z.array(z.object({ id: z.string(), usecase: z.string(), base: z.string() })) })
      .parse(await (await fetch(`${base}/api/blueprints/presets`)).json());
    expect(listing.presets).toContainEqual(expect.objectContaining({ id: "home-library", usecase: "product", base: "local" }));
  });
});

describe("GET /api/blueprints/pairs/:base/:usecase", () => {
  it("shows the interview and the composed steps of a real pair", async () => {
    const preview = z
      .object({
        hearing: z.object({ questions: z.array(z.object({ id: z.string() })) }),
        steps: z.array(z.object({ id: z.string(), gates: z.array(z.string()) })),
      })
      .parse(await (await fetch(`${base}/api/blueprints/pairs/firebase/internal`)).json());
    expect(preview.hearing.questions[0].id).toBe("appName");
    // The spec is written first, and read by a person before anything is created in their cloud.
    expect(preview.steps[0].id).toBe("spec");
    expect(preview.steps[1].gates).toContain("review");
  });

  it("refuses a pair that does not compose", async () => {
    expect((await fetch(`${base}/api/blueprints/pairs/internal/firebase`)).status).toBe(400);
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

  it("answers 409 for a run that does not exist", async () => {
    expect((await fetch(`${base}/api/blueprints/runs/run-00000404`)).status).toBe(409);
  });
});
