// The palette's side of the resume rows (#2498): read the acting directory's past conversations
// while the palette is up, the way the launch panel reads them for its own directory.
import { computed, watch } from "vue";
import { useResumableSessions } from "./useDirLists";
import { paletteResumes, type PaletteResume } from "./paletteResumes";
import type { TerminalAgent } from "../../common/sessionAgent";

interface ResumeSources {
  dir: () => string | null;
  agent: () => TerminalAgent;
  openSessionIds: () => readonly string[];
}

export function usePaletteResumes({ dir, agent, openSessionIds }: ResumeSources) {
  const list = useResumableSessions();
  // Another directory's or another agent's rows must not stand while the replacement is read, so
  // they go at once and the new list comes in behind them (#1372).
  watch(
    [dir, agent],
    ([nextDir, nextAgent]) => {
      list.forget();
      void list.load(nextDir, nextAgent);
    },
    { immediate: true },
  );
  const resumes = computed((): PaletteResume[] => paletteResumes(list.value.value, openSessionIds()));
  return { resumes };
}
