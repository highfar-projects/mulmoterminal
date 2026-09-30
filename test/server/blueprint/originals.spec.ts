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
    expect(await originalsOf("/p", reader, 0)).toEqual({
      files: [
        { path: "a.md", original: "old a", current: "new a" },
        { path: "docs/b.md", original: "old b", current: "new b" },
      ],
      more: false,
    });
  });

  it("gives a file that is gone as null, and leaves out an original it could not read", async () => {
    const reader = fakeReader({ ".blueprint/originals/gone.md": "old" }, ["gone.md", "unreadable.md"]);
    expect(await originalsOf("/p", reader, 0)).toEqual({ files: [{ path: "gone.md", original: "old", current: null }], more: false });
  });

  it("says more are left when the walk stopped early", async () => {
    expect((await originalsOf("/p", fakeReader({}, [], false), 0)).more).toBe(true);
  });
});

describe("originalsOf with proposed copies", () => {
  const since = 1000;
  const reader = (files: Record<string, string>, listed: readonly (readonly [string, number])[]): OriginalsReader => ({
    list: async (dir) => ({ entries: dir.endsWith("originals") ? [] : listed.map(([file, mtimeMs]) => ({ path: file, mtimeMs })), complete: true }),
    read: async (_dir, relative) => files[relative] ?? null,
  });

  it("pairs a copy written during the build with the document it was made from", async () => {
    const files = { "contract.txt": "old", "contract.proposed.txt": "new", "docs/a.md": "a", "docs/a.proposed.md": "a2" };
    const listed = [
      ["contract.txt", 1],
      ["contract.proposed.txt", 2000],
      ["docs/a.proposed.md", 1500],
    ] as const;
    expect(await originalsOf("/p", reader(files, listed), since)).toEqual({
      files: [
        { path: "contract.proposed.txt", original: "old", current: "new", from: "contract.txt" },
        { path: "docs/a.proposed.md", original: "a", current: "a2", from: "docs/a.md" },
      ],
      more: false,
    });
  });

  it("leaves out a copy from before the build, one whose document is gone, and a file that is no copy", async () => {
    const files = { "old.txt": "o", "old.proposed.txt": "o2", "orphan.proposed.txt": "x", "plain.txt": "p" };
    const listed = [
      ["old.proposed.txt", 10],
      ["orphan.proposed.txt", 2000],
      ["plain.txt", 2000],
    ] as const;
    expect(await originalsOf("/p", reader(files, listed), since)).toEqual({ files: [], more: false });
  });

  it("leaves out a copy it could not read", async () => {
    expect(await originalsOf("/p", reader({ "a.md": "old" }, [["a.proposed.md", 2000]]), since)).toEqual({ files: [], more: false });
  });

  it("puts the kept originals first, and stops at the limit across both", async () => {
    const kept = Array.from({ length: 15 }, (_, index) => `k${String(index).padStart(2, "0")}.md`);
    const proposed = Array.from({ length: 10 }, (_, index) => `p${String(index).padStart(2, "0")}.proposed.md`);
    const files = Object.fromEntries([
      ...kept.flatMap((file) => [
        [`.blueprint/originals/${file}`, "was"],
        [file, "is"],
      ]),
      ...proposed.flatMap((file) => [
        [file, "new"],
        [file.replace(".proposed", ""), "old"],
      ]),
    ]);
    const both: OriginalsReader = {
      list: async (dir) => ({
        entries: dir.endsWith("originals") ? kept.map((file) => ({ path: file, mtimeMs: 0 })) : proposed.map((file) => ({ path: file, mtimeMs: 2000 })),
        complete: true,
      }),
      read: async (_dir, relative) => files[relative] ?? null,
    };
    const view = await originalsOf("/p", both, since);
    expect(view.files.map((file) => file.path)).toEqual([...kept, ...proposed.slice(0, 5)]);
    expect(view.more).toBe(true);
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
    const view = await originalsOf(dir, { list: listProjectFiles, read: readProjectFile }, 0);
    expect(view.files).toEqual([{ path: "note.md", original: "before\n", current: "after\n" }]);
  });
});
