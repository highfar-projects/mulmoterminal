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
  const deps = {
    cwd: () => "/proj",
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
      restore: vi.fn(async (next: TabStrip) => {
        tabsStrip.value = next;
      }),
      open: vi.fn(async () => {}),
    },
    file: { close: vi.fn(async () => true), fileError: ref<string | null>(null) },
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
  return { ops: holder.ops, deps, tabsStrip, dirs };
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

  it("says why when the server refuses, and brings the front file back", async () => {
    treeOp.mockResolvedValue({ ok: false, message: "a file or folder with that name already exists" });
    const { ops, deps, tabsStrip } = setup(STRIP, { ask: "a.md" });
    await ops.run({ id: "rename", label: "", icon: "", pathRel: "src/x.ts", isDir: false });
    expect(deps.file.fileError.value).toBe("a file or folder with that name already exists");
    expect(tabsStrip.value).toEqual(STRIP);
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
});
