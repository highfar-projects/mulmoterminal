// @vitest-environment node
// The packs as the form lists them: a pack with an `order` first, the rest by slug — never the filesystem's order,
// which put a newly added base ahead of the one the form used to open on.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { listPacks } from "../../../server/blueprint/packs";

let root = "";
let installed = "";

const basePack = async (slug: string, order?: number, dir = root) => {
  await mkdir(path.join(dir, slug));
  const manifest = { slug, kind: "base", title: slug, version: "0.1.0", platform: "local", ...(order === undefined ? {} : { order }) };
  await writeFile(path.join(dir, slug, "manifest.json"), JSON.stringify(manifest));
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-order-"));
  installed = await mkdtemp(path.join(tmpdir(), "blueprint-order-installed-"));
});
afterEach(async () => {
  await Promise.all([root, installed].map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("listPacks", () => {
  it("lists a pack with an order ahead of one whose slug comes first, and the rest by slug", async () => {
    await Promise.all([basePack("cloudflare"), basePack("repo"), basePack("docs", 1), basePack("firebase")]);
    const packs = await listPacks([{ dir: root, source: "builtin" }]);
    expect(packs.map((pack) => pack.slug)).toEqual(["docs", "cloudflare", "firebase", "repo"]);
  });

  it("ignores the order an installed pack gives itself, so it cannot take the form's default base", async () => {
    await Promise.all([basePack("docs", 1), basePack("firebase"), basePack("aaa-market", 0, installed)]);
    const packs = await listPacks([
      { dir: root, source: "builtin" },
      { dir: installed, source: "installed" },
    ]);
    expect(packs.map((pack) => pack.slug)).toEqual(["docs", "aaa-market", "firebase"]);
  });
});
