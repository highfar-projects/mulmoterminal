// @vitest-environment node
// Reading a small text file back from a project: only a plain file really inside it, never through a link, and
// never more than the size limit — a report path can come from a pack installed from the market.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_FILE_MAX_BYTES, readProjectFile } from "../../../server/blueprint/projectFiles";

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
