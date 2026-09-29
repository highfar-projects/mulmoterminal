import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { TabStrip } from "../../../src/components/filesTabs";
import type { TreeNode } from "../../../src/composables/useFilesTree";

// #2578. The tree's file operations: the server is stubbed; what is pinned is what this end asks,
// and what it does to the tabs and the tree around the call.
const { treeOp, trashAvailable } = vi.hoisted(() => ({
  treeOp: vi.fn(),
  trashAvailable: vi.fn(async () => true),
}));
vi.mock("../../../src/components/treeFileOpsApi", () => ({ treeOp, trashAvailable }));
const { useTreeFileOps } = await import("../../../src/composables/useTreeFileOps");

function setup(strip: TabStrip, answers: { ask?: string | null; confirm?: boolean } = {}) {
  const tabsStrip = ref<TabStrip>(strip);
  const dirs = new Map<string, TreeNode>();
  const fileError = ref<string | null>(null);
  const root = ref("/proj");
  const deps = {
    cwd: () => root.value,
    focusRow: vi.fn(),
    changed: vi.fn(),
    tree: {
      refresh: vi.fn(async () => {}),
      findNode: (path: string) => dirs.get(path) ?? null,
      toggleDir: vi.fn(async (node: TreeNode) => {
        node.expanded = true;
      }),
    },
    tabs: {
      strip: tabsStrip,
      current: () => tabsStrip.value,
      // As the real one does: reopening the front file clears the pane's error line.
      restore: vi.fn(async (next: TabStrip) => {
        tabsStrip.value = next;
        fileError.value = null;
      }),
      open: vi.fn(async () => {}),
    },
    file: { close: vi.fn(async () => true), fileError },
    t: (key: string) => key,
    ask: vi.fn(() => (answers.ask === undefined ? "new.md" : answers.ask)),
    confirm: vi.fn(() => answers.confirm ?? true),
  };
  const holder: { ops: ReturnType<typeof useTreeFileOps> | null } = { ops: null };
  mount(
    defineComponent({
      setup() {
        holder.ops = useTreeFileOps(deps);
        return () => h("div");
      },
    }),
  );
  if (!holder.ops) throw new Error("not mounted");
  return { ops: holder.ops, deps, tabsStrip, dirs, root };
}

const STRIP: TabStrip = { tabs: [{ path: "a.md" }, { path: "src/x.ts" }], activePath: "src/x.ts" };

beforeEach(() => treeOp.mockReset());

describe("useTreeFileOps", () => {
  it("creates a file in the folder, opens that folder, and opens the file", async () => {
    treeOp.mockResolvedValue({ ok: true, path: "src/new.md" });
    const { ops, deps, dirs } = setup(STRIP);
    const src: TreeNode = { name: "src", path: "src", dir: true, expanded: false, loaded: false, children: [], size: 0 };
    dirs.set("src", src);
    await ops.run({ id: "new-file", label: "", icon: "", dirRel: "src" });
    expect(treeOp).toHaveBeenCalledWith("create", "cwd=%2Fproj&path=src", { name: "new.md", kind: "file" });
    expect(deps.tree.toggleDir).toHaveBeenCalledWith(src);
    expect(deps.tabs.open).toHaveBeenCalledWith("src/new.md");
  });

  // A folder opened once and collapsed keeps its old listing; it is read again before it opens.
  it("reads a folder again before opening it, so the new entry is in it", async () => {
    treeOp.mockResolvedValue({ ok: true, path: "src/n.ts" });
    const { ops, deps, dirs } = setup(STRIP, { ask: "n.ts" });
    const src: TreeNode = { name: "src", path: "src", dir: true, expanded: false, loaded: true, children: [], size: 0 };
    dirs.set("src", src);
    await ops.run({ id: "new-file", label: "", icon: "", dirRel: "src" });
    expect(deps.tree.refresh).toHaveBeenCalledWith("src");
    expect(deps.tree.refresh.mock.invocationCallOrder[0]).toBeLessThan(deps.tree.toggleDir.mock.invocationCallOrder[0] ?? 0);
  });

  it("asks nothing of the server when the name is cancelled", async () => {
    const { ops } = setup(STRIP, { ask: null });
    await ops.run({ id: "new-folder", label: "", icon: "", dirRel: "" });
    expect(treeOp).not.toHaveBeenCalled();
  });

  // The front file is put down first, then comes back under its new name.
  it("renames the front file and keeps its tab, reopened at the new name", async () => {
    treeOp.mockResolvedValue({ ok: true, path: "src/y.ts" });
    const { ops, deps, tabsStrip } = setup(STRIP, { ask: "y.ts" });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src/x.ts", isDir: false });
    expect(deps.file.close).toHaveBeenCalled();
    expect(deps.tree.refresh).toHaveBeenCalledWith("src");
    expect(tabsStrip.value).toEqual({ tabs: [{ path: "a.md" }, { path: "src/y.ts" }], activePath: "src/y.ts" });
  });

  it("renames a folder behind the front tab without putting the front file down", async () => {
    treeOp.mockResolvedValue({ ok: true, path: "lib" });
    const { ops, deps, tabsStrip } = setup({ tabs: [{ path: "a.md" }, { path: "src/x.ts" }], activePath: "a.md" }, { ask: "lib" });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src", isDir: true });
    expect(deps.file.close).not.toHaveBeenCalled();
    expect(tabsStrip.value).toEqual({ tabs: [{ path: "a.md" }, { path: "lib/x.ts" }], activePath: "a.md" });
  });

  it("changes nothing when the front file cannot be put down", async () => {
    const { ops, deps } = setup(STRIP, { ask: "y.ts" });
    deps.file.close.mockResolvedValue(false);
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src/x.ts", isDir: false });
    expect(treeOp).not.toHaveBeenCalled();
  });

  // Reopening the front file clears the error line, so the refusal is said after it is back up.
  it.each([
    ["rename", { id: "rename" as const, label: "", icon: "", pathRel: "src/x.ts", isDir: false }],
    ["trash", { id: "trash" as const, label: "", icon: "", pathRel: "src/x.ts", isDir: false }],
  ])("says why when the server refuses a %s of the front file, after bringing it back", async (_case, action) => {
    treeOp.mockResolvedValue({ ok: false, message: "refused" });
    const { ops, deps, tabsStrip } = setup(STRIP, { ask: "a.md" });
    await ops.run(action);
    expect(deps.tabs.restore).toHaveBeenCalled();
    expect(deps.file.fileError.value).toBe("refused");
    expect(tabsStrip.value).toEqual(STRIP);
  });

  // The front file did not move, so the strip as it is NOW gets the change: a tab opened while the
  // request was out stays.
  it("keeps a tab opened while a rename behind the front was in flight", async () => {
    const { ops, tabsStrip } = setup({ tabs: [{ path: "a.md" }, { path: "src/x.ts" }], activePath: "a.md" }, { ask: "lib" });
    treeOp.mockImplementation(async () => {
      tabsStrip.value = { tabs: [...tabsStrip.value.tabs, { path: "c.md" }], activePath: "c.md" };
      return { ok: true, path: "lib" };
    });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src", isDir: true });
    expect(tabsStrip.value).toEqual({ tabs: [{ path: "a.md" }, { path: "lib/x.ts" }, { path: "c.md" }], activePath: "c.md" });
  });

  it("asks first, then moves to the Trash and closes the tabs on it", async () => {
    treeOp.mockResolvedValue({ ok: true, path: null });
    const { ops, deps, tabsStrip } = setup(STRIP);
    await ops.run({ id: "trash", label: "", icon: "", pathRel: "src", isDir: true });
    expect(deps.confirm).toHaveBeenCalled();
    expect(treeOp).toHaveBeenCalledWith("trash", "cwd=%2Fproj&path=src", {});
    expect(tabsStrip.value).toEqual({ tabs: [{ path: "a.md" }], activePath: "a.md" });
    expect(deps.tree.refresh).toHaveBeenCalledWith("");
  });

  it("moves nothing when the question is declined", async () => {
    const { ops } = setup(STRIP, { confirm: false });
    await ops.run({ id: "trash", label: "", icon: "", pathRel: "a.md", isDir: false });
    expect(treeOp).not.toHaveBeenCalled();
  });

  it("learns from the server whether there is a Trash", async () => {
    const { ops } = setup(STRIP);
    await Promise.resolve();
    await Promise.resolve();
    expect(ops.trash.value).toBe(true);
  });

  // The menu that asked is gone, and after a rename or a Trash so may be its row: the keyboard is put
  // on the row the operation leaves behind.
  it.each([
    ["the new file", { id: "new-file" as const, label: "", icon: "", dirRel: "src" }, { ok: true, path: "src/new.md" }, "src/new.md"],
    ["the renamed entry", { id: "rename" as const, label: "", icon: "", pathRel: "a.md", isDir: false }, { ok: true, path: "new.md" }, "new.md"],
    ["the folder a trashed entry was in", { id: "trash" as const, label: "", icon: "", pathRel: "src/x.ts", isDir: false }, { ok: true, path: null }, "src"],
    ["the row itself when refused", { id: "rename" as const, label: "", icon: "", pathRel: "a.md", isDir: false }, { ok: false, message: "no" }, "a.md"],
  ])("puts the keyboard on %s, and reads the git marks again", async (_case, action, answer, landing) => {
    treeOp.mockResolvedValue(answer);
    const { ops, deps } = setup(STRIP);
    await ops.run(action);
    expect(deps.focusRow).toHaveBeenLastCalledWith(landing);
    expect(deps.changed).toHaveBeenCalled();
  });

  it("puts the keyboard back on the row when the name is cancelled", async () => {
    const { ops, deps } = setup(STRIP, { ask: null });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "a.md", isDir: false });
    expect(deps.focusRow).toHaveBeenLastCalledWith("a.md");
  });

  // The pane was re-rooted while the request was out: nothing of it is applied to the new folder.
  it("applies nothing when the pane moved to another folder meanwhile", async () => {
    const { ops, deps, tabsStrip, root } = setup(STRIP, { ask: "y.ts" });
    treeOp.mockImplementation(async () => {
      root.value = "/other";
      tabsStrip.value = { tabs: [{ path: "src/x.ts" }], activePath: "src/x.ts" };
      return { ok: false, message: "late" };
    });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src/x.ts", isDir: false });
    expect(deps.tabs.restore).not.toHaveBeenCalled();
    expect(deps.tree.refresh).not.toHaveBeenCalled();
    expect(deps.file.fileError.value).toBeNull();
    expect(deps.focusRow).not.toHaveBeenCalled();
    expect(tabsStrip.value).toEqual({ tabs: [{ path: "src/x.ts" }], activePath: "src/x.ts" });
  });
});
