import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useFolderView } from "../../../src/composables/useFolderView";
import { FOLDER_VIEW_MAX_DIRS, FOLDER_VIEW_READS_AT_ONCE } from "../../../src/components/folderView";

type Tree = Record<string, Array<{ name: string; dir: boolean; size: number }>>;
const d = (name: string) => ({ name, dir: true, size: 0 });
const f = (name: string) => ({ name, dir: false, size: 1 });

/** A fetch answering `/browse/list` from `tree`, keyed by `path`; a path not in it is a 404. */
function serve(tree: Tree) {
  const asked: string[] = [];
  globalThis.fetch = vi.fn(async (url: string) => {
    const pathRel = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("path") ?? "";
    asked.push(pathRel);
    const entries = tree[pathRel];
    return entries ? { ok: true, status: 200, json: async () => ({ entries }) } : { ok: false, status: 404, json: async () => ({}) };
  }) as unknown as typeof fetch;
  return asked;
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useFolderView", () => {
  it("shows the root first, and reads only the folder itself until subfolders are asked for", async () => {
    const asked = serve({ "": [d("a"), f("x.png")], a: [f("y.png")] });
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    await settle();
    expect(view.groups.value?.map((g) => g.dirRel)).toEqual([""]);
    expect(asked).toEqual([""]);
    view.withSubfolders.value = true;
    await settle();
    expect(view.groups.value?.map((g) => g.dirRel)).toEqual(["", "a"]);
  });

  it("reads two levels below and no deeper, leaving out dot-folders and an unreadable subfolder", async () => {
    serve({ s: [d("a"), d(".git"), d("gone")], "s/a": [d("b")], "s/a/b": [d("c")], "s/a/b/c": [f("deep.png")] });
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.withSubfolders.value = true;
    view.show("s");
    await settle();
    expect(view.groups.value?.map((g) => g.dirRel)).toEqual(["s", "s/a", "s/a/b"]);
    expect(view.error.value).toBeNull();
  });

  it("reads no more folders than the cap", async () => {
    const wide = Array.from({ length: FOLDER_VIEW_MAX_DIRS * 2 }, (_, i) => d(`d${i}`));
    const tree: Tree = { "": wide };
    wide.forEach((entry) => (tree[entry.name] = [d("inner")]));
    const asked = serve(tree);
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.withSubfolders.value = true;
    await settle();
    expect(view.groups.value).toHaveLength(FOLDER_VIEW_MAX_DIRS);
    expect(new Set(asked.filter((pathRel) => pathRel !== "")).size).toBe(FOLDER_VIEW_MAX_DIRS - 1);
  });

  it("does not read while hidden, and reads the last folder clicked when it is seen", async () => {
    const asked = serve({ "": [], a: [], b: [f("z.png")] });
    const seen = ref(false);
    const view = useFolderView(
      () => "/proj",
      () => seen.value,
    );
    view.show("a");
    view.show("b");
    await settle();
    expect(asked).toEqual([]);
    seen.value = true;
    await nextTick();
    await settle();
    expect(asked).toEqual(["b"]);
    expect(view.groups.value?.[0]?.entries.map((e) => e.name)).toEqual(["z.png"]);
  });

  it("keeps only the newest folder's listing", async () => {
    const answers: Array<(value: unknown) => void> = [];
    globalThis.fetch = vi.fn(() => new Promise((resolve) => answers.push(resolve))) as unknown as typeof fetch;
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.show("new");
    await nextTick();
    answers[1]?.({ ok: true, json: async () => ({ entries: [f("n.png")] }) });
    await settle();
    answers[0]?.({ ok: true, json: async () => ({ entries: [f("root.png")] }) });
    await settle();
    expect(view.groups.value?.map((g) => g.dirRel)).toEqual(["new"]);
  });

  it("says which folder could not be read, the root as `.`", async () => {
    serve({});
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    await settle();
    expect(view.error.value).toBe(".: HTTP 404");
    view.show("gone");
    await settle();
    expect(view.error.value).toBe("gone: HTTP 404");
  });

  it("goes back to the root and reads it on reset, and never reacts to the cwd by itself", async () => {
    const asked = serve({ "": [], a: [] });
    const cwd = ref("/one");
    const view = useFolderView(
      () => cwd.value,
      () => true,
    );
    view.show("a");
    await settle();
    asked.length = 0;
    cwd.value = "/two";
    await settle();
    expect(asked).toEqual([]);
    view.reset();
    await settle();
    expect(view.dir.value).toBe("");
    expect(asked).toEqual([""]);
    view.reset();
    await settle();
    expect(asked).toEqual(["", ""]);
  });

  it("falls back to the root when the folder on show is trashed, and stays when it is still there", async () => {
    const tree: Tree = { "": [d("a")], a: [] };
    serve(tree);
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.show("a");
    await settle();
    await view.afterTreeOp({ id: "rename", pathRel: "a" });
    expect(view.dir.value).toBe("a");
    delete tree.a;
    await view.afterTreeOp({ id: "trash", pathRel: "a" });
    expect(view.dir.value).toBe("");
  });

  it("remembers the mode per browser, and survives storage that throws", () => {
    serve({ "": [] });
    const view = useFolderView(
      () => "/proj",
      () => false,
    );
    expect(view.mode.value).toBe("list");
    view.setMode("gallery");
    expect(
      useFolderView(
        () => "/proj",
        () => false,
      ).mode.value,
    ).toBe("gallery");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const blocked = useFolderView(
      () => "/proj",
      () => false,
    );
    expect(blocked.mode.value).toBe("list");
    blocked.setMode("gallery");
    expect(blocked.mode.value).toBe("gallery");
  });

  // The pane's teardown resets the view on unmount too, and Vue stops its watchers right after.
  it("reads nothing when reset as its pane unmounts", async () => {
    const asked = serve({ "": [] });
    const scope = effectScope();
    const view = scope.run(() =>
      useFolderView(
        () => "/proj",
        () => true,
      ),
    );
    await settle();
    asked.length = 0;
    view?.reset();
    scope.stop();
    await settle();
    expect(asked).toEqual([]);
  });

  it("reads a re-rooted view once, though it comes into sight in the same tick", async () => {
    const asked = serve({ "": [] });
    const seen = ref(false);
    const view = useFolderView(
      () => "/proj",
      () => seen.value,
    );
    seen.value = true;
    view.reset();
    await settle();
    expect(asked).toEqual([""]);
  });

  it("re-reads on refresh with the listing left on screen, and only forgets it while hidden", async () => {
    const tree: Tree = { "": [f("a.png")] };
    const asked = serve(tree);
    const seen = ref(true);
    const view = useFolderView(
      () => "/proj",
      () => seen.value,
    );
    await settle();
    tree[""] = [f("a.png"), f("b.png")];
    view.refresh();
    expect(view.groups.value?.[0]?.entries.map((e) => e.name)).toEqual(["a.png"]);
    await settle();
    expect(view.groups.value?.[0]?.entries.map((e) => e.name)).toEqual(["a.png", "b.png"]);
    seen.value = false;
    await nextTick();
    asked.length = 0;
    view.refresh();
    await settle();
    expect(asked).toEqual([]);
    expect(view.groups.value).toBeNull();
  });

  it("tries a folder that could not be read again on refresh", async () => {
    const tree: Tree = {};
    serve(tree);
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    await settle();
    expect(view.error.value).toBe(".: HTTP 404");
    tree[""] = [f("x.png")];
    view.refresh();
    await settle();
    expect(view.error.value).toBeNull();
    expect(view.groups.value?.[0]?.entries.map((e) => e.name)).toEqual(["x.png"]);
  });

  it("leaves the view be for a tree operation in a folder it does not draw, and re-reads in place for one it does", async () => {
    const asked = serve({ "": [d("src"), f("a.png")], src: [] });
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    await settle();
    asked.length = 0;
    await view.afterTreeOp({ id: "trash", pathRel: "src/deep/x.ts" });
    await settle();
    expect(asked).toEqual([]);
    void view.afterTreeOp({ id: "new-file", dirRel: "" });
    expect(view.groups.value).not.toBeNull();
    await settle();
    expect(asked).toEqual([""]);
  });

  it("stops reading the subfolders of a folder it has moved on from", async () => {
    const wide = Array.from({ length: FOLDER_VIEW_READS_AT_ONCE * 3 }, (_, i) => d(`s${i}`));
    const tree: Tree = { "": [], a: wide, b: [] };
    wide.forEach((entry) => (tree[`a/${entry.name}`] = []));
    const asked = serve(tree);
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.withSubfolders.value = true;
    await settle();
    asked.length = 0;
    view.show("a");
    await nextTick();
    view.show("b");
    await settle();
    expect(asked.filter((pathRel) => pathRel.startsWith("a/")).length).toBeLessThanOrEqual(FOLDER_VIEW_READS_AT_ONCE);
    expect(view.groups.value?.map((g) => g.dirRel)).toEqual(["b"]);
  });

  it("counts a subfolder that cannot be read against the cap", async () => {
    const top = Array.from({ length: FOLDER_VIEW_MAX_DIRS }, (_, i) => d(`d${i}`));
    const tree: Tree = { "": top };
    top.forEach((entry, i) => {
      if (i % 2 === 0) tree[entry.name] = [d("inner")];
    });
    const asked = serve(tree);
    const view = useFolderView(
      () => "/proj",
      () => true,
    );
    view.withSubfolders.value = true;
    await settle();
    expect(new Set(asked).size).toBe(FOLDER_VIEW_MAX_DIRS);
  });
});
