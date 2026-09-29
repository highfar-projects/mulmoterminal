// The open file as HEAD has it, handed to the editor to mark changes against (#2497). Cleared the
// moment another file is opened — marks against the previous file's HEAD would be wrong for a line
// or two until the new one arrived — and read again when asked.
import { ref, watch, type Ref, type ShallowRef } from "vue";
import type { CmEditor } from "../components/cmEditor";
import { browseQuery } from "../components/filesPaneApi";
import { isRecord } from "../../common/isRecord";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export interface FileHeadTextDeps {
  cwd: () => string | null;
  openPath: Ref<string | null>;
  /** Set for a file that is not text; it has nothing to mark. */
  unpreviewable: Ref<string | null>;
  editor: ShallowRef<CmEditor | null>;
}

export interface FileHeadText {
  /** Whether there is a HEAD version to mark against — false outside git, for a new file, or while
   *  one is being read. */
  hasOriginal: Ref<boolean>;
  refresh: () => Promise<void>;
}

/** The route's answer as HEAD's text, or null. */
export const headTextFrom = (body: unknown): string | null => (isRecord(body) && typeof body.text === "string" ? body.text : null);

export function useFileHeadText(deps: FileHeadTextDeps): FileHeadText {
  const hasOriginal = ref(false);
  let readId = 0;
  const apply = (text: string | null): void => {
    hasOriginal.value = text !== null;
    deps.editor.value?.setOriginal(text);
  };
  // `sync`: the new file's text is put into the editor in the same breath as its path is set, and
  // the old marks must be gone by then.
  watch(
    deps.openPath,
    () => {
      readId += 1;
      apply(null);
    },
    { flush: "sync" },
  );

  async function refresh(): Promise<void> {
    const id = ++readId;
    const pathRel = deps.openPath.value;
    if (!pathRel || deps.unpreviewable.value) return apply(null);
    try {
      const res = await fetchWithTimeout(`/api/files/browse/head?${browseQuery(deps.cwd(), pathRel)}`);
      const text = res.ok ? headTextFrom(await jsonBody(res)) : null;
      if (id === readId && deps.openPath.value === pathRel) apply(text);
    } catch {
      // Offline or restarting: the marks stay as they were until the next read.
    }
  }

  return { hasOriginal, refresh };
}
