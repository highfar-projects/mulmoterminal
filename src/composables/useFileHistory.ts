// A file's history in the Files pane (#2574): the backups the store kept of it, compared with the
// buffer through the same change marks HEAD uses, and restored as an edit the reader then saves.
import { ref, watch, type Ref, type ShallowRef } from "vue";
import type { CmEditor } from "../components/cmEditor";
import { browseQuery } from "../components/filesPaneApi";
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
  /** The pane's "show the removed lines" switch: comparing turns it on, since that is the view. */
  showChanges: Ref<boolean>;
}

export interface FileHistory {
  open: Ref<boolean>;
  /** The backup the marks are drawn against now, for the banner that offers to restore it. */
  comparing: Ref<BackupEntry | null>;
  entries: Ref<BackupEntry[]>;
  failed: Ref<boolean>;
  toggle: () => Promise<void>;
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

export function useFileHistory(deps: FileHistoryDeps): FileHistory {
  const open = ref(false);
  const entries = ref<BackupEntry[]>([]);
  const failed = ref(false);
  const comparing = ref<BackupEntry | null>(null);
  watch(deps.head.comparingAt, (at) => {
    if (at === null) comparing.value = null;
  });
  watch(deps.openPath, () => {
    open.value = false;
    entries.value = [];
    failed.value = false;
  });

  const query = (pathRel: string): string => browseQuery(deps.cwd(), pathRel);

  async function load(pathRel: string): Promise<void> {
    const listed = await fetchBackups(query(pathRel));
    if (deps.openPath.value !== pathRel) return;
    entries.value = listed ?? [];
    failed.value = listed === null;
  }

  async function toggle(): Promise<void> {
    open.value = !open.value;
    const pathRel = deps.openPath.value;
    failed.value = false;
    if (open.value && pathRel) await load(pathRel);
  }

  /** One backup's text, or null — with the answer dropped when the reader has moved to another file. */
  async function read(entry: BackupEntry): Promise<string | null> {
    const pathRel = deps.openPath.value;
    if (!pathRel) return null;
    const text = await fetchBackupText(query(pathRel), entry.id);
    failed.value = text === null;
    return deps.openPath.value === pathRel ? text : null;
  }

  async function compare(entry: BackupEntry): Promise<void> {
    const text = await read(entry);
    if (text === null) return;
    deps.head.compareWith(text, entry.at);
    comparing.value = entry;
    deps.showChanges.value = true;
    open.value = false;
  }

  // An edit, not a load: it can be undone, it marks the buffer unsaved, and the current text is kept
  // as a backup when the reader saves over it — so restoring never loses what was there.
  async function restore(entry: BackupEntry): Promise<void> {
    const text = await read(entry);
    if (text === null) return;
    deps.editor.value?.replaceDoc(text);
    await deps.head.stopComparing();
    open.value = false;
  }

  return { open, comparing, entries, failed, toggle, compare, restore };
}
