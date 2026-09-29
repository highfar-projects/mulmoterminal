// @vitest-environment node
// The shared apps a build may start from: a known folder with an app.json and shared collections beside it, offered by
// its id and its declared name — and only a folder the list offers can be opened.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CollectionSchemaZ, type LoadedCollection } from "@mulmoclaude/core/collection/server";
import { sharedAppsFromFolders } from "../../../server/blueprint/sharedAppsProvider";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bp-apps-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A stand-in collection: the provider only counts them and hands them on.
const SCHEMA = CollectionSchemaZ.parse({
  title: "Votes",
  icon: "x",
  dataPath: "data/votes/items",
  primaryKey: "id",
  fields: { id: { type: "string", label: "ID", primary: true } },
});
const sharedIn = (dir: string): LoadedCollection[] =>
  path.basename(dir).startsWith("app") ? [{ slug: "votes", source: "project", schema: SCHEMA, dataDir: dir, skillDir: dir, appId: "aid" }] : [];

async function folder(name: string, manifest?: string): Promise<{ id: string; label: string; cwd: string }> {
  const cwd = path.join(root, name);
  await mkdir(cwd, { recursive: true });
  if (manifest !== undefined) await writeFile(path.join(cwd, "app.json"), manifest);
  return { id: `id-${name}`, label: name, cwd };
}

const provider = (roots: { id: string; label: string; cwd: string }[]) =>
  sharedAppsFromFolders({ roots: () => roots, collectionsOf: async (dir) => sharedIn(dir), signedInEmail: () => "me@example.com" });

describe("sharedAppsFromFolders", () => {
  it("offers only folders with an app.json object and shared collections, by the declared name or else the folder's", async () => {
    const roots = [
      await folder("app-named", JSON.stringify({ name: "Council votes" })),
      await folder("app-unnamed", JSON.stringify({ aid: "x" })),
      await folder("app-broken", "{not json"),
      await folder("app-array", "[]"),
      await folder("plain-with-manifest", JSON.stringify({ name: "No collections" })),
      await folder("app-no-manifest"),
    ];
    expect(await provider(roots).list()).toEqual([
      { id: "id-app-named", title: "Council votes" },
      { id: "id-app-unnamed", title: "app-unnamed" },
    ]);
  });

  it("opens an offered app with its declaration as written, and nothing it does not offer", async () => {
    const manifest = JSON.stringify({ name: "Council votes", members: {} });
    const roots = [await folder("app-named", manifest)];
    const opened = await provider(roots).open("id-app-named");
    expect(opened).toMatchObject({ root: roots[0]?.cwd, manifest, title: "Council votes" });
    expect(opened?.collections).toHaveLength(1);
    expect(await provider(roots).open("id-elsewhere")).toBeNull();
  });

  it("hands on who is signed in", () => {
    expect(provider([]).signedInEmail()).toBe("me@example.com");
  });
});
