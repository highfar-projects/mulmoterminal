// A file's history in the Files pane (#2574): the backups the store kept of it, compared with the
// buffer through the same change marks HEAD uses, and restored as an edit the reader then saves.
import { ref, watch, type Ref, type ShallowRef } from "vue";
import type { CmEditor } from "../components/cmEditor";
import { bankText, browseQuery } from "../components/filesPaneApi";
import { backupEntriesFrom, type BackupEntry } from "../../common/fileBackups";
import { isRecord } from "../../common/isRecord";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { FileHeadText } from "./useFileHeadText";

export interface FileHistoryDeps {
  cwd: () => string | null;
  openPath: Ref<string | null>;
  editor: ShallowRef<CmEditor | null>;
  head: FileHeadText;
  /** The pane's "show the removed lines" switch: comparing turns it on, and stopping puts it back. */
  showChanges: Ref<boolean>;
  dirty: Ref<boolean>;
  saving: Ref<boolean>;
}

/** The version the marks are drawn against, with its text: kept, because the store rotates old
 *  versions out while an agent keeps rewriting the file, and Restore must still have it. */
export interface ComparedVersion {
  entry: BackupEntry;
  text: string;
}

export interface FileHistory {
  open: Ref<boolean>;
  comparing: Ref<ComparedVersion | null>;
  entries: Ref<BackupEntry[]>;
  failed: Ref<boolean>;
  toggle: () => Promise<void>;
  close: () => void;
  compare: (entry: BackupEntry) => Promise<void>;
  restore: (entry: BackupEntry) => Promise<void>;
}

/** The `/api/files/browse/backup` answer's text, or null. */
export const backupTextFrom = (body: unknown): string | null => (isRecord(body) && typeof body.text === "string" ? body.text : null);

/** The file's backups, newest first, or null when they could not be read. */
async function fetchBackups(query: string): Promise<BackupEntry[] | null> {
  try {
    const res = await fetchWithTimeout(`/api/files/browse/backups?${query}`);
    return res.ok ? backupEntriesFrom(await jsonBody(res)) : null;
  } catch {
    return null;
  }
}

/** One backup's text, or null when it could not be read. */
async function fetchBackupText(query: string, id: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`/api/files/browse/backup?${query}&id=${encodeURIComponent(id)}`);
    return res.ok ? backupTextFrom(await jsonBody(res)) : null;
  } catch {
    return null;
  }
}

/** Put `text` in the buffer as an edit. A buffer with unsaved edits is banked first — restoring must
 *  never be the step that loses them — and nothing happens if that fails. False when it did not land. */
async function replaceBuffer(deps: FileHistoryDeps, query: string, text: string): Promise<boolean> {
  const editor = deps.editor.value;
  // A save in flight read the buffer before it went out and will mark it saved when it lands.
  if (!editor || deps.saving.value) return false;
  const current = editor.getDoc();
  if (current === text) return true;
  if (deps.dirty.value && !(await bankText(query, current))) return false;
  editor.replaceDoc(text);
  return true;
}

export function useFileHistory(deps: FileHistoryDeps): FileHistory {
  const open = ref(false);
  const entries = ref<BackupEntry[]>([]);
  const failed = ref(false);
  const comparing = ref<ComparedVersion | null>(null);
  // What the Changes switch was before comparing turned it on, to put back when comparing ends.
  let changesBefore: boolean | null = null;
  watch(deps.head.comparingAt, (at) => {
    if (at !== null) return;
    comparing.value = null;
    if (changesBefore !== null) deps.showChanges.value = changesBefore;
    changesBefore = null;
  });
  watch(deps.openPath, () => {
    open.value = false;
    entries.value = [];
    failed.value = false;
  });

  const query = (pathRel: string): string => browseQuery(deps.cwd(), pathRel);

  async function toggle(): Promise<void> {
    open.value = !open.value;
    failed.value = false;
    const pathRel = deps.openPath.value;
    if (!open.value || !pathRel) return;
    const listed = await fetchBackups(query(pathRel));
    if (deps.openPath.value !== pathRel) return;
    entries.value = listed ?? [];
    failed.value = listed === null;
  }

  /** A version's text: the compared one from memory, any other from the store — dropped when the
   *  reader has moved to another file meanwhile. */
  async function read(entry: BackupEntry): Promise<string | null> {
    if (comparing.value?.entry.id === entry.id) return comparing.value.text;
    const pathRel = deps.openPath.value;
    if (!pathRel) return null;
    const text = await fetchBackupText(query(pathRel), entry.id);
    if (deps.openPath.value !== pathRel) return null;
    failed.value = text === null;
    return text;
  }

  async function compare(entry: BackupEntry): Promise<void> {
    const text = await read(entry);
    if (text === null) return;
    deps.head.compareWith(text, entry.at);
    comparing.value = { entry, text };
    changesBefore ??= deps.showChanges.value;
    deps.showChanges.value = true;
    open.value = false;
    deps.editor.value?.focus();
  }

  // An edit, not a load: it can be undone, it marks the buffer unsaved, and it is saved like typing.
  async function restore(entry: BackupEntry): Promise<void> {
    const pathRel = deps.openPath.value;
    const text = await read(entry);
    if (text === null || !pathRel || deps.openPath.value !== pathRel) return;
    const landed = await replaceBuffer(deps, query(pathRel), text);
    failed.value = !landed;
    if (!landed) return;
    await deps.head.stopComparing();
    open.value = false;
    deps.editor.value?.focus();
  }

  return { open, comparing, entries, failed, toggle, close: () => (open.value = false), compare, restore };
}
