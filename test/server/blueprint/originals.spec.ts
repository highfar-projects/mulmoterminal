// @vitest-environment node
// A build's originals beside its files now: read through the same guard as every file a build reads back.
import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { originalsOf, type OriginalsReader } from "../../../server/blueprint/originals";
import { listProjectFiles, readProjectFile } from "../../../server/blueprint/projectFiles";

const fakeReader = (files: Record<string, string>, listed: string[], complete = true): OriginalsReader => ({
  list: async () => ({ entries: listed.map((file) => ({ path: file, mtimeMs: 0 })), complete }),
  read: async (_dir, relative) => files[relative] ?? null,
});

describe("originalsOf", () => {
  it("pairs each original with the file as it is now", async () => {
    const reader = fakeReader({ ".blueprint/originals/a.md": "old a", "a.md": "new a", ".blueprint/originals/docs/b.md": "old b", "docs/b.md": "new b" }, [
      "docs/b.md",
      "a.md",
    ]);
    expect(await originalsOf("/p", reader)).toEqual({
      files: [
        { path: "a.md", original: "old a", current: "new a" },
        { path: "docs/b.md", original: "old b", current: "new b" },
      ],
      more: false,
    });
  });

  it("gives a file that is gone as null, and leaves out an original it could not read", async () => {
    const reader = fakeReader({ ".blueprint/originals/gone.md": "old" }, ["gone.md", "unreadable.md"]);
    expect(await originalsOf("/p", reader)).toEqual({ files: [{ path: "gone.md", original: "old", current: null }], more: false });
  });

  it("says more are left when the walk stopped early", async () => {
    expect((await originalsOf("/p", fakeReader({}, [], false))).more).toBe(true);
  });
});

describe("originalsOf on a real folder", () => {
  let dir = "";
  let outside = "";
  afterEach(async () => {
    await Promise.all([dir, outside].filter(Boolean).map((folder) => rm(folder, { recursive: true, force: true })));
  });

  it("reads the originals the build kept, and not one that is a link", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "blueprint-originals-"));
    outside = await mkdtemp(path.join(tmpdir(), "blueprint-originals-outside-"));
    await mkdir(path.join(dir, ".blueprint", "originals"), { recursive: true });
    await writeFile(path.join(dir, ".blueprint", "originals", "note.md"), "before\n");
    await writeFile(path.join(dir, "note.md"), "after\n");
    await writeFile(path.join(outside, "secret.md"), "not the build's\n");
    await symlink(path.join(outside, "secret.md"), path.join(dir, ".blueprint", "originals", "secret.md"));
    const view = await originalsOf(dir, { list: listProjectFiles, read: readProjectFile });
    expect(view.files).toEqual([{ path: "note.md", original: "before\n", current: "after\n" }]);
  });
});
