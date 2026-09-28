// @vitest-environment node
// Reading a small text file back from a project: only a plain file really inside it, never through a link, and
// never more than the size limit — a report path can come from a pack installed from the market.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listProjectFiles, PROJECT_FILE_MAX_BYTES, readProjectFile } from "../../../server/blueprint/projectFiles";

let root = "";
let project = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "blueprint-project-files-"));
  project = path.join(root, "project");
  await mkdir(path.join(project, ".blueprint"), { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("readProjectFile", () => {
  it("reads a plain file in the project", async () => {
    await writeFile(path.join(project, ".blueprint", "report.md"), "## 報告");
    expect(await readProjectFile(project, ".blueprint/report.md")).toBe("## 報告");
  });

  it("is null when the file is absent or is a folder", async () => {
    expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
    await mkdir(path.join(project, ".blueprint", "report.md"));
    expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
  });

  it("does not read a path that climbs out of the project", async () => {
    await writeFile(path.join(root, "outside.md"), "outside");
    expect(await readProjectFile(project, "../outside.md")).toBeNull();
    expect(await readProjectFile(project, ".blueprint/../../outside.md")).toBeNull();
  });

  it("says so instead of reading a file over the limit", async () => {
    await writeFile(path.join(project, ".blueprint", "report.md"), "x".repeat(PROJECT_FILE_MAX_BYTES + 1));
    expect(await readProjectFile(project, ".blueprint/report.md")).toContain("too large to show");
  });

  describe.skipIf(process.platform === "win32")("links", () => {
    it("does not read through a link, even to a file inside the project", async () => {
      await writeFile(path.join(root, "secret.md"), "outside");
      await symlink(path.join(root, "secret.md"), path.join(project, ".blueprint", "report.md"));
      expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
      await writeFile(path.join(project, "inside.md"), "inside");
      await rm(path.join(project, ".blueprint", "report.md"));
      await symlink(path.join(project, "inside.md"), path.join(project, ".blueprint", "report.md"));
      expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
    });

    it("does not read through a folder that is a link, even one to a folder inside the project", async () => {
      await mkdir(path.join(project, "elsewhere"));
      await writeFile(path.join(project, "elsewhere", "report.md"), "inside, but reached through a link");
      await rm(path.join(project, ".blueprint"), { recursive: true });
      await symlink(path.join(project, "elsewhere"), path.join(project, ".blueprint"));
      expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
    });

    it("does not read a file whose folder is a link out of the project", async () => {
      const outside = path.join(root, "outside");
      await mkdir(outside);
      await writeFile(path.join(outside, "report.md"), "outside");
      await rm(path.join(project, ".blueprint"), { recursive: true });
      await symlink(outside, path.join(project, ".blueprint"));
      expect(await readProjectFile(project, ".blueprint/report.md")).toBeNull();
    });
  });
});

describe("listProjectFiles", () => {
  const pathsIn = async (dir: string) => (await listProjectFiles(dir)).map((entry) => entry.path).sort();

  it("lists plain files with their change times, not entering hidden folders or installed packages", async () => {
    await mkdir(path.join(project, "notes", "deep"), { recursive: true });
    await mkdir(path.join(project, "node_modules", "p"), { recursive: true });
    await writeFile(path.join(project, "contract.proposed.txt"), "案");
    await writeFile(path.join(project, "notes", "deep", "a.md"), "a");
    await writeFile(path.join(project, ".blueprint", "findings.json"), "{}");
    await writeFile(path.join(project, "node_modules", "p", "index.js"), "");
    await writeFile(path.join(project, ".env"), "");
    expect(await pathsIn(project)).toEqual(["contract.proposed.txt", "notes/deep/a.md"]);
    const [entry] = await listProjectFiles(project).then((entries) => entries.filter((found) => found.path === "contract.proposed.txt"));
    expect(entry?.mtimeMs).toBeGreaterThan(0);
  });

  it("stops at the depth limit rather than walking the whole tree", async () => {
    const deep = path.join(project, "1", "2", "3", "4", "5", "6", "7");
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(project, "1", "2", "3", "4", "5", "6", "six.md"), "");
    await writeFile(path.join(deep, "seven.md"), "");
    expect(await pathsIn(project)).toEqual(["1/2/3/4/5/6/six.md"]);
  });

  it("stops reading deeper once it has seen as many entries as allowed, keeping the shallow ones", async () => {
    await mkdir(path.join(project, "a", "b"), { recursive: true });
    await writeFile(path.join(project, "top.md"), "");
    await writeFile(path.join(project, "a", "mid.md"), "");
    await writeFile(path.join(project, "a", "b", "low.md"), "");
    // The root holds .blueprint, a and top.md: three entries spend the whole budget before a is read.
    expect((await listProjectFiles(project, { maxDepth: 6, maxEntries: 3 })).map((entry) => entry.path)).toEqual(["top.md"]);
    expect((await listProjectFiles(project, { maxDepth: 6, maxEntries: 5 })).map((entry) => entry.path).sort()).toEqual(["a/mid.md", "top.md"]);
    expect((await listProjectFiles(project, { maxDepth: 1, maxEntries: 5000 })).map((entry) => entry.path).sort()).toEqual(["a/mid.md", "top.md"]);
  });

  it("reads a folder with more names than the budget only up to the budget", async () => {
    await Promise.all(["1.md", "2.md", "3.md", "4.md", "5.md"].map((name) => writeFile(path.join(project, name), "")));
    expect(await listProjectFiles(project)).toHaveLength(5);
    // Three names read, one of which may be .blueprint: at most three files, never all five.
    const bounded = await listProjectFiles(project, { maxDepth: 6, maxEntries: 3 });
    expect(bounded.length).toBeGreaterThanOrEqual(2);
    expect(bounded.length).toBeLessThanOrEqual(3);
  });

  it("is empty for a folder that is not there", async () => {
    expect(await listProjectFiles(path.join(root, "missing"))).toEqual([]);
  });

  describe.skipIf(process.platform === "win32")("links", () => {
    it("lists neither a linked file nor anything through a linked folder", async () => {
      await mkdir(path.join(root, "outside"), { recursive: true });
      await writeFile(path.join(root, "outside", "secret.md"), "");
      await symlink(path.join(root, "outside", "secret.md"), path.join(project, "secret.md"));
      await symlink(path.join(root, "outside"), path.join(project, "outside"));
      await writeFile(path.join(project, "own.md"), "");
      expect(await pathsIn(project)).toEqual(["own.md"]);
    });
  });
});
