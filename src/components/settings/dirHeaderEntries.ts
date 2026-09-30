// A directory's header buttons, palette commands and chips as the Settings form changes them (#2727):
// one change at a time through POST /api/dir-config/entries, which answers with the directory's
// detail — also when it refuses the change, so the form catches up with a list that moved.
import { isRecord } from "../../../common/isRecord";
import { postEntryChange, type EntryChange } from "../../composables/configEntryChange";
import { parseDirConfigDetail, type DirConfigDetailView } from "../dirConfigDetail";

export type DirEntryList = "buttons" | "chips" | "commands";

export async function changeDirEntries<P extends string>(
  cwd: string,
  list: DirEntryList,
  action: string,
  payload: Record<string, unknown>,
  isProblem: (value: unknown) => value is P,
): Promise<{ change: EntryChange<P>; detail: DirConfigDetailView | null }> {
  const change = await postEntryChange("/api/dir-config/entries", { ...payload, cwd, list, action }, isProblem);
  return { change, detail: detailIn(change) };
}

// A success answers the detail itself; a refusal carries it under `detail`.
function detailIn(change: EntryChange<string>): DirConfigDetailView | null {
  if (change.ok) return parseDirConfigDetail(change.body);
  return change.body !== null && isRecord(change.body.detail) ? parseDirConfigDetail(change.body.detail) : null;
}
