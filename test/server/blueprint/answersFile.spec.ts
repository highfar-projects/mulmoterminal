// @vitest-environment node
// The interview answers the host writes into a build's `.blueprint/`: never through a `.blueprint` that is a link or a
// file, which could carry the write out of the build's folder.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { recordFolderIsReal, writeAnswers } from "../../../server/blueprint/answersFile";

let root = "";
let project = "";
let outside = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-answers-"));
  project = path.join(root, "project");
  outside = path.join(root, "outside");
  await Promise.all([mkdir(project), mkdir(outside)]);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writeAnswers", () => {
  it("writes into a .blueprint it makes, or one that is a real folder", async () => {
    await writeAnswers(project, { kind: "契約書" });
    expect(JSON.parse(await readFile(path.join(project, ".blueprint", "answers.json"), "utf8"))).toEqual({ kind: "契約書" });
    await writeAnswers(project, { kind: "規程" });
    expect(JSON.parse(await readFile(path.join(project, ".blueprint", "answers.json"), "utf8"))).toEqual({ kind: "規程" });
  });

  it("writes nothing through a .blueprint that is a link out of the folder", async () => {
    await symlink(outside, path.join(project, ".blueprint"));
    await expect(writeAnswers(project, { kind: "契約書" })).rejects.toThrow("a link or a file");
    expect(await readdir(outside)).toEqual([]);
  });

  it("writes nothing when .blueprint is a file", async () => {
    await writeFile(path.join(project, ".blueprint"), "not a folder");
    await expect(writeAnswers(project, { kind: "契約書" })).rejects.toThrow("a link or a file");
    expect(await readFile(path.join(project, ".blueprint"), "utf8")).toBe("not a folder");
  });
});

describe("recordFolderIsReal", () => {
  it("is true with no .blueprint yet and with a real one, false for a link or a file", async () => {
    expect(await recordFolderIsReal(project)).toBe(true);
    await mkdir(path.join(project, ".blueprint"));
    expect(await recordFolderIsReal(project)).toBe(true);
    const linked = path.join(root, "linked");
    await mkdir(linked);
    await symlink(outside, path.join(linked, ".blueprint"));
    expect(await recordFolderIsReal(linked)).toBe(false);
    const filed = path.join(root, "filed");
    await mkdir(filed);
    await writeFile(path.join(filed, ".blueprint"), "x");
    expect(await recordFolderIsReal(filed)).toBe(false);
  });

  // Not a question of absent or present: a .blueprint nobody can look at is not known to be safe to write into.
  it.skipIf(process.platform === "win32")("is false when .blueprint cannot be looked at", async () => {
    const locked = path.join(root, "locked");
    await mkdir(path.join(locked, ".blueprint"), { recursive: true });
    await chmod(locked, 0o000);
    try {
      expect(await recordFolderIsReal(locked)).toBe(false);
    } finally {
      await chmod(locked, 0o700);
    }
  });
});
