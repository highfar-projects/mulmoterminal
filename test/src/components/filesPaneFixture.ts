import type { FilesPaneState, FilesTabState } from "../../../src/components/filesPaneState";
import { activeTab } from "../../../src/components/filesPaneState";

type OneFileFields = Omit<FilesTabState, "path"> & { expanded?: string[]; treeScrollTop?: number };

/** A pane state with ONE file open — or none, for a null path — written the way the pane looked
 *  before tabs (#2267): the file's own facts beside the pane's. */
export function oneFile(openPath: string | null, fields: OneFileFields = {}): FilesPaneState {
  const { expanded = [], treeScrollTop, ...file } = fields;
  return {
    tabs: openPath ? [{ path: openPath, ...file }] : [],
    activePath: openPath,
    expanded,
    ...(treeScrollTop === undefined ? {} : { treeScrollTop }),
  };
}

/** The front tab of a snapshot, for a spec asserting on the open file's remembered facts. */
export const frontTab = (state: FilesPaneState): FilesTabState | null => activeTab(state);
