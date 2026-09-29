// Which paths under the Files pane's root git sees as changed (#2496), read from the server and
// kept fresh. The tree draws from it (filesGitDecorations.ts); this is the half that fetches.
//
// Read again when the tree loads, when the open file's version moves (a save, a re-read of an
// outside change), and on the same period the open file is checked for outside changes — an agent
// writing files is the common case, and it announces nothing to this pane.
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { isFileGitState, type FileGitState } from "../../common/fileGitStatus";
import { isRecord } from "../../common/isRecord";
import { browseQuery } from "../components/filesPaneApi";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { EXTERNAL_CHECK_MS } from "./externalFileChanges";

export interface FilesGitStatus {
  files: Ref<Record<string, FileGitState>>;
  refresh: () => Promise<void>;
  /** The pane is re-rooting: what was read belongs to the root being left. */
  reset: () => void;
}

/** The server's answer as a map, keeping only entries whose state this side knows. */
export function gitFilesFrom(body: unknown): Record<string, FileGitState> {
  if (!isRecord(body) || !isRecord(body.files)) return {};
  return Object.fromEntries(Object.entries(body.files).filter((entry): entry is [string, FileGitState] => isFileGitState(entry[1])));
}

export function useFilesGitStatus(cwd: () => string | null): FilesGitStatus {
  const files = ref<Record<string, FileGitState>>({});
  // Which read is current: a slow answer for the root being left must not land on the new one.
  let readId = 0;

  async function refresh(): Promise<void> {
    const id = ++readId;
    try {
      const res = await fetchWithTimeout(`/api/files/browse/git-status?${browseQuery(cwd(), "")}`);
      const body = res.ok ? await jsonBody(res) : null;
      if (id === readId) files.value = gitFilesFrom(body);
    } catch {
      // Offline or restarting: the marks stay as they were, and the next tick asks again.
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, EXTERNAL_CHECK_MS);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  return {
    files,
    refresh,
    reset: () => {
      readId += 1;
      files.value = {};
    },
  };
}
