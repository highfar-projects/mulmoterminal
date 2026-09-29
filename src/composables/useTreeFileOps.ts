// The tree's file operations from the row menu (#2578): a new file or folder, a rename, and a move to
// the Trash. The server does the work and keeps it inside the pane's root (files-tree-routes.ts);
// this end asks for the name, keeps the tabs on what moved, and reads the folder again.
//
// A tab on a renamed entry stays open under the new name; a tab on a trashed one closes. The file in
// front is saved and put down first when it is the one moving, so no buffer is left pointing at a
// path that is gone, and it comes back up afterwards — at its new name, or its neighbour.
import { onMounted, ref, type Ref } from "vue";
import type { FilesRowAction } from "../components/filesRowActions";
import { browseQuery } from "../components/filesPaneApi";
import { isUnder, renamedIn, withoutEntry, type TabStrip } from "../components/filesTabs";
import { treeOp, trashAvailable, type TreeOpOutcome } from "../components/treeFileOpsApi";
import type { FilesTabs } from "./useFilesTabs";
import type { FilesTree } from "./useFilesTree";
import type { OpenFile } from "./useOpenFile";

type TreeOpAction = Extract<FilesRowAction, { id: "new-file" | "new-folder" | "rename" | "trash" }>;

export const isTreeOpAction = (action: FilesRowAction): action is TreeOpAction =>
  action.id === "new-file" || action.id === "new-folder" || action.id === "rename" || action.id === "trash";

export interface TreeFileOpsDeps {
  cwd: () => string | null;
  tree: Pick<FilesTree, "refresh" | "findNode" | "toggleDir">;
  tabs: Pick<FilesTabs, "strip" | "current" | "restore" | "open">;
  file: Pick<OpenFile, "close" | "fileError">;
  t: (key: string, params?: Record<string, string>) => string;
  /** The browser's own dialogs, injected so the flows can be driven in a spec. */
  ask: (message: string, value: string) => string | null;
  confirm: (message: string) => boolean;
}

export interface TreeFileOps {
  /** Whether the server has a Trash to move entries to; without one the menu offers no delete. */
  trash: Ref<boolean>;
  run: (action: TreeOpAction) => Promise<void>;
}

const parentOf = (pathRel: string): string => (pathRel.includes("/") ? pathRel.slice(0, pathRel.lastIndexOf("/")) : "");
const nameOf = (pathRel: string): string => pathRel.slice(pathRel.lastIndexOf("/") + 1);

export function useTreeFileOps(deps: TreeFileOpsDeps): TreeFileOps {
  const trash = ref(false);
  onMounted(async () => {
    trash.value = await trashAvailable();
  });

  const failed = (outcome: TreeOpOutcome): boolean => {
    if (!outcome.ok) deps.file.fileError.value = outcome.message;
    return !outcome.ok;
  };
  /** Said after the tabs settle: reopening the front file clears the pane's error line. */
  const reportAfter = (outcome: TreeOpOutcome): void => {
    if (!outcome.ok) deps.file.fileError.value = outcome.message;
  };

  async function create(dirRel: string, kind: "file" | "dir"): Promise<void> {
    const name = deps.ask(deps.t(kind === "file" ? "fileOps.newFile" : "fileOps.newFolder"), "")?.trim();
    if (!name) return;
    const outcome = await treeOp("create", browseQuery(deps.cwd(), dirRel), { name, kind });
    if (failed(outcome)) return;
    // Read again first — a folder opened once and collapsed keeps its old listing — then opened, so
    // the new entry is in sight.
    await deps.tree.refresh(dirRel);
    const dir = dirRel === "" ? null : deps.tree.findNode(dirRel);
    if (dir?.dir && !dir.expanded) await deps.tree.toggleDir(dir);
    if (kind === "file" && outcome.ok && outcome.path) await deps.tabs.open(outcome.path);
  }

  /** Put the front file down when it is on the moving entry. False when it could not be (a save that
   *  lost to another writer): the operation does not happen then. */
  async function releaseFront(entry: string): Promise<boolean> {
    const front = deps.tabs.strip.value.activePath;
    return front === null || !isUnder(front, entry) || deps.file.close();
  }

  /** The strip after the operation, shown. When the front file moved it is reopened from the strip
   *  as it was; otherwise the change is applied to the strip as it is NOW, so a tab opened while the
   *  request was out is kept. */
  async function settle(before: TabStrip, change: (strip: TabStrip) => TabStrip, frontMoved: boolean): Promise<void> {
    if (frontMoved) await deps.tabs.restore(change(before), () => true);
    else deps.tabs.strip.value = change(deps.tabs.strip.value);
  }

  async function rename(pathRel: string): Promise<void> {
    const name = deps.ask(deps.t("fileOps.rename"), nameOf(pathRel))?.trim();
    if (!name || name === nameOf(pathRel)) return;
    const before = deps.tabs.current();
    const frontMoved = before.activePath !== null && isUnder(before.activePath, pathRel);
    if (!(await releaseFront(pathRel))) return;
    const outcome = await treeOp("rename", browseQuery(deps.cwd(), pathRel), { name });
    await deps.tree.refresh(parentOf(pathRel));
    const renamed = outcome.ok ? outcome.path : null;
    await settle(before, (strip) => (renamed ? renamedIn(strip, pathRel, renamed) : strip), frontMoved);
    reportAfter(outcome);
  }

  async function moveToTrash(pathRel: string): Promise<void> {
    if (!deps.confirm(deps.t("fileOps.trashConfirm", { name: nameOf(pathRel) }))) return;
    const before = deps.tabs.current();
    const frontMoved = before.activePath !== null && isUnder(before.activePath, pathRel);
    if (!(await releaseFront(pathRel))) return;
    const outcome = await treeOp("trash", browseQuery(deps.cwd(), pathRel), {});
    await deps.tree.refresh(parentOf(pathRel));
    await settle(before, (strip) => (outcome.ok ? withoutEntry(strip, pathRel) : strip), frontMoved);
    reportAfter(outcome);
  }

  async function run(action: TreeOpAction): Promise<void> {
    if ("dirRel" in action) return create(action.dirRel, action.id === "new-file" ? "file" : "dir");
    return action.id === "rename" ? rename(action.pathRel) : moveToTrash(action.pathRel);
  }

  return { trash, run };
}
