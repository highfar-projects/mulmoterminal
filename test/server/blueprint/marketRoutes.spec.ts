// @vitest-environment node
// The market routes over real HTTP, with the registry and the clone faked: each refusal a person can meet
// answers with a code the UI words, beside the English.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { z } from "zod";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { mountMarketRoutes } from "../../../server/blueprint/marketRoutes";
import type { CloneRepo } from "../../../server/blueprint/installer";
import { englishRefusal, refusalSchema, type Refusal } from "../../../common/blueprint/refusal";

const PACKS_ROOT = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const REGISTRY = "https://example.com/registry.json";
const PACKS = [
  { slug: "acme-tool", kind: "usecase", title: "Acme", repo: "https://example.com/acme.git" },
  { slug: "review", kind: "usecase", title: "Shipped", repo: "https://example.com/review.git" },
  { slug: "on-disk", kind: "usecase", title: "Local", repo: "file:///tmp/on-disk" },
];

let root = "";
let server: Server;
let base = "";
const COMMIT = "0".repeat(40);
const cloneNothing: CloneRepo = async () => COMMIT;
// What the next install's clone does; each test sets its own.
const cloning: { impl: CloneRepo } = { impl: cloneNothing };

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-market-routes-"));
  const app = express();
  app.use(express.json());
  mountMarketRoutes(app, {
    builtinRoot: { dir: PACKS_ROOT, source: "builtin" },
    packsDir: path.join(root, "packs"),
    registriesFile: path.join(root, "registries.json"),
    clone: (repo, ref, dest) => cloning.impl(repo, ref, dest),
    fetchImpl: async () => JSON.stringify({ name: "Example", packs: PACKS }),
    now: () => 1,
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
beforeEach(async () => {
  cloning.impl = cloneNothing;
  await writeFile(path.join(root, "registries.json"), JSON.stringify({ urls: [REGISTRY] }));
});

const bodySchema = z.object({ error: z.string(), refusal: refusalSchema.optional() });
const send = async (method: "POST" | "PUT", route: string, body: unknown) => {
  const res = await fetch(`${base}${route}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: bodySchema.parse(await res.json()) };
};
const install = (slug: string, registryUrl = REGISTRY) => send("POST", "/api/blueprints/market/install", { registryUrl, slug });

const refusedWith = (status: number, refusal: Refusal) => ({ status, body: { error: englishRefusal(refusal), refusal } });

describe("the market's refusals", () => {
  it("names the registry addresses it will not read", async () => {
    const res = await send("PUT", "/api/blueprints/market/registries", { urls: [REGISTRY, "http://example.com/r.json"] });
    expect(res).toEqual(refusedWith(400, { code: "registry-url-not-allowed", urls: ["http://example.com/r.json"] }));
  });

  it("refuses a registry this machine does not read, and a pack its registry does not list", async () => {
    expect(await install("acme-tool", "https://other.example.com/r.json")).toEqual(
      refusedWith(400, { code: "registry-unknown", url: "https://other.example.com/r.json" }),
    );
    expect(await install("no-such-pack")).toEqual(refusedWith(404, { code: "pack-not-listed", url: REGISTRY, slug: "no-such-pack" }));
  });

  it("refuses to replace a shipped pack, and a web registry's pack on this machine's disk", async () => {
    expect(await install("review")).toEqual(refusedWith(409, { code: "pack-builtin", slug: "review" }));
    expect(await install("on-disk")).toEqual(refusedWith(409, { code: "pack-local-repo", repo: "file:///tmp/on-disk" }));
  });

  it("says what is wrong with a pack that cannot be installed as it is", async () => {
    cloning.impl = async (_repo, _ref, dest) => {
      await mkdir(dest, { recursive: true });
      return COMMIT;
    };
    const res = await install("acme-tool");
    expect(res.status).toBe(409);
    expect(res.body.refusal).toEqual({ code: "pack-broken", detail: expect.stringContaining("manifest.json") });
    expect(res.body.error).toBe(res.body.refusal?.code === "pack-broken" ? res.body.refusal.detail : "");
  });

  it("says a fetch failed, with what failed", async () => {
    cloning.impl = async () => {
      throw new Error("git clone: could not resolve host");
    };
    expect(await install("acme-tool")).toEqual(refusedWith(502, { code: "install-failed", detail: "git clone: could not resolve host" }));
  });

  it("refuses a second install of a pack while the first is still going", async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    cloning.impl = async () => {
      await held;
      throw new Error("stopped");
    };
    const first = install("acme-tool");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await install("acme-tool")).toEqual(refusedWith(409, { code: "pack-busy", slug: "acme-tool" }));
    release();
    expect((await first).status).toBe(502);
  });

  it("refuses to remove a pack that is not installed", async () => {
    expect(await send("POST", "/api/blueprints/market/uninstall", { slug: "acme-tool" })).toEqual(
      refusedWith(404, { code: "pack-not-installed", slug: "acme-tool" }),
    );
  });
});
