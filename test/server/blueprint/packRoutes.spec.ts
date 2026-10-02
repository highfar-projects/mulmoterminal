// @vitest-environment node
// What the new-build form reads about the packs, over real HTTP against the shipped packs: the examples, a pair's
// interview and steps, and their words in the screen's language.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { z } from "zod";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { mountBlueprintRoutes } from "../../../server/blueprint/routes";
import type { BlueprintExecutor } from "../../../server/blueprint/executor";
import { blueprintRunSchema } from "../../../common/blueprint/run";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const unused = async (): Promise<never> => {
  throw new Error("not used here");
};
// A polish build as it was stored when it started: its steps' titles in the packs' own Japanese.
const storedRun = blueprintRunSchema.parse({
  id: "run-00000001",
  projectDir: "/work/docs",
  basePackDir: path.join(PACKS_ROOT, "docs"),
  usecasePackDir: path.join(PACKS_ROOT, "polish"),
  steps: [
    { id: "workspace", title: "フォルダと chaff を確かめる", description: "", skill: "s", check: "true", gates: [], reads: [], origin: "base" },
    { id: "polish", title: "一つずつ整える", description: "", skill: "s", check: "true", gates: ["review"], reads: [], origin: "usecase" },
  ],
  createdAtMs: 1,
});
const listedIn: (string | undefined)[] = [];
const executor: BlueprintExecutor = {
  create: unused,
  view: async () => ({ run: storedRun, state: { steps: {} } }),
  humanEvent: async () => ({ run: storedRun, state: { steps: {} } }),
  ask: unused,
  list: async (screenLanguage) => {
    listedIn.push(screenLanguage);
    return [];
  },
  workingIn: async () => null,
  specView: unused,
  say: async () => ({ run: storedRun, state: { steps: {} } }),
  reportView: unused,
  recover: unused,
  archive: async () => ({ run: storedRun, state: { steps: {} } }),
};

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  mountBlueprintRoutes(app, {
    executor,
    ensureOwner: async () => undefined,
    packRoots: [{ dir: PACKS_ROOT, source: "builtin" }],
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

describe("the form's routes in the screen's language", () => {
  const json = async (url: string): Promise<unknown> => (await fetch(`${base}${url}`)).json();
  const titled = z.object({
    slug: z.string().optional(),
    id: z.string().optional(),
    manifest: z.object({ title: z.string() }).optional(),
    title: z.string().optional(),
  });

  it("names the packs, examples and questions in English for ?lang=en, and as written without it", async () => {
    const polishTitle = async (url: string) =>
      z
        .object({ packs: z.array(titled) })
        .parse(await json(url))
        .packs.find((pack) => pack.slug === "polish")?.manifest?.title;
    expect(await polishTitle("/api/blueprints/packs?lang=en")).toBe("Polish documents (without changing what they say)");
    expect(await polishTitle("/api/blueprints/packs")).toBe("文書を整える（書いてあることは変えずに）");
    const presets = z.object({ presets: z.array(titled) }).parse(await json("/api/blueprints/presets?lang=en")).presets;
    expect(presets).toContainEqual(expect.objectContaining({ id: "blog", title: "Polish a blog post as a blog post" }));
    const preview = z
      .object({ hearing: z.object({ questions: z.array(z.object({ id: z.string(), label: z.string() })) }) })
      .parse(await json("/api/blueprints/pairs/docs/polish?lang=en"));
    expect(preview.hearing.questions.find((question) => question.id === "style")?.label).toBe("Which style should they follow?");
  });
});

describe("a build's view and the list in the screen's language", () => {
  const titlesOf = async (url: string) =>
    z
      .object({ run: z.object({ steps: z.array(z.object({ id: z.string(), title: z.string() })) }) })
      .parse(await (await fetch(`${base}${url}`)).json())
      .run.steps.map((step) => step.title);

  it("shows the stored steps in English for ?lang=en, and as stored without it", async () => {
    expect(await titlesOf("/api/blueprints/runs/run-00000001?lang=en")).toEqual(["Check the folder and chaff", "Polish them one by one"]);
    expect(await titlesOf("/api/blueprints/runs/run-00000001")).toEqual(["フォルダと chaff を確かめる", "一つずつ整える"]);
  });

  it("answers an action on a build in English too, so the screen does not flip back to the stored words", async () => {
    const posted = async (route: string, body: unknown) =>
      z
        .object({ run: z.object({ steps: z.array(z.object({ title: z.string() })) }) })
        .parse(await (await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json())
        .run.steps.map((step) => step.title);
    const english = ["Check the folder and chaff", "Polish them one by one"];
    expect(await posted("/api/blueprints/runs/run-00000001/events?lang=en", { type: "approve", stepId: "polish" })).toEqual(english);
    expect(await posted("/api/blueprints/runs/run-00000001/archive?lang=en", { archived: true })).toEqual(english);
    expect(await posted("/api/blueprints/runs/run-00000001/spec/messages?lang=en", { message: "hi" })).toEqual(english);
    expect(await posted("/api/blueprints/runs/run-00000001/archive", { archived: false })).toEqual(["フォルダと chaff を確かめる", "一つずつ整える"]);
  });

  it("hands the screen's language to the list", async () => {
    listedIn.length = 0;
    await fetch(`${base}/api/blueprints/runs?lang=en`);
    await fetch(`${base}/api/blueprints/runs`);
    expect(listedIn).toEqual(["en", undefined]);
  });
});
