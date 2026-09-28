// @vitest-environment node
// Reading an example's samples from its pack folder, and placing them in a project folder on disk.
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeSamples, readSamples } from "../../../server/blueprint/samples";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-samples-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("readSamples", () => {
  it("reads the plain files of the preset's folder, in name order, and nothing else", async () => {
    const dir = path.join(root, "presets", "ex");
    await mkdir(path.join(dir, "nested"), { recursive: true });
    await writeFile(path.join(dir, "b.md"), "B");
    await writeFile(path.join(dir, "a.md"), "A");
    await writeFile(path.join(dir, ".hidden"), "H");
    await writeFile(path.join(dir, "nested", "c.md"), "C");
    expect(await readSamples(root, "ex")).toEqual([
      { name: "a.md", content: "A" },
      { name: "b.md", content: "B" },
    ]);
  });

  it.skipIf(process.platform === "win32")("does not follow a link in the preset's folder, which could point outside the pack", async () => {
    const dir = path.join(root, "presets", "ex");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(root, "secret.md"), "outside the pack");
    await symlink(path.join(root, "secret.md"), path.join(dir, "linked.md"));
    await writeFile(path.join(dir, "a.md"), "A");
    expect(await readSamples(root, "ex")).toEqual([{ name: "a.md", content: "A" }]);
  });

  it.skipIf(process.platform === "win32")("brings nothing when the preset's folder is itself a link", async () => {
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "a.md"), "outside the pack");
    await mkdir(path.join(root, "presets"));
    await symlink(outside, path.join(root, "presets", "ex"));
    expect(await readSamples(root, "ex")).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("brings nothing when the presets folder above it is a link out of the pack", async () => {
    const pack = path.join(root, "pack");
    const outside = path.join(root, "outside");
    await mkdir(path.join(outside, "ex"), { recursive: true });
    await writeFile(path.join(outside, "ex", "a.md"), "outside the pack");
    await mkdir(pack);
    await symlink(outside, path.join(pack, "presets"));
    expect(await readSamples(pack, "ex")).toEqual([]);
  });

  it("has none for a preset without a folder", async () => {
    expect(await readSamples(root, "missing")).toEqual([]);
  });
});

describe("placeSamples", () => {
  const samples = [
    { name: "a.md", content: "A" },
    { name: "b.md", content: "B" },
  ];

  it("copies the missing ones and leaves an identical one alone", async () => {
    await writeFile(path.join(root, "b.md"), "B");
    expect(await placeSamples(root, samples)).toEqual({ clashes: [] });
    expect(await readFile(path.join(root, "a.md"), "utf8")).toBe("A");
  });

  it("writes nothing when any name clashes", async () => {
    await writeFile(path.join(root, "b.md"), "mine");
    expect(await placeSamples(root, samples)).toEqual({ clashes: ["b.md"] });
    await expect(readFile(path.join(root, "a.md"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, "b.md"), "utf8")).toBe("mine");
  });

  it("removes its own copies when another copy fails, leaving the folder as it was", async () => {
    const withBadTarget = [
      { name: "a.md", content: "A" },
      { name: "no-such-folder/x.md", content: "X" },
    ];
    await expect(placeSamples(path.join(root), withBadTarget)).rejects.toThrow();
    await expect(readFile(path.join(root, "a.md"), "utf8")).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")("treats a link of the same name as a clash, even a broken one", async () => {
    await symlink(path.join(root, "nowhere.md"), path.join(root, "a.md"));
    expect(await placeSamples(root, samples)).toEqual({ clashes: ["a.md"] });
    await expect(readFile(path.join(root, "b.md"), "utf8")).rejects.toThrow();
  });

  it("treats a folder of the same name as a clash", async () => {
    await mkdir(path.join(root, "a.md"));
    expect(await placeSamples(root, samples)).toEqual({ clashes: ["a.md"] });
  });
});
