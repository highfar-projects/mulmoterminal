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

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const unused = async (): Promise<never> => {
  throw new Error("not used here");
};
const executor: BlueprintExecutor = {
  create: unused,
  view: unused,
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
