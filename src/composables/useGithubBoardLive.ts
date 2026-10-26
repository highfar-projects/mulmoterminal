// Keeping the GitHub board current while it is open (#3182): its cells follow the `sessions` channel
// the grid listens to, and the board is read again on a slow tick while visible and shortly after a
// cell on it finishes a turn.
import { computed, onUnmounted, watch, type ComputedRef, type Ref } from "vue";
import type { RepoBoard } from "../../common/githubBoard";
import { boardSessionIds, finishedTurns, withLiveCells } from "../components/boardLive";
import { useGridActivity } from "./useGridActivity";
import { usePollWhileVisible } from "./usePollWhileVisible";

// GitHub state changes on a scale of minutes; each read is a few `gh` calls per repo.
export const BOARD_POLL_MS = 60_000;
// Long enough for a push the agent just made to show up in `gh pr list`.
export const BOARD_TURN_RELOAD_DELAY_MS = 3_000;

export function useGithubBoardLive(repos: Ref<RepoBoard[]>, load: () => void): ComputedRef<RepoBoard[]> {
  const sessionIds = computed(() => boardSessionIds(repos.value));
  const { activity } = useGridActivity(sessionIds);

  usePollWhileVisible(load, BOARD_POLL_MS);

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const reloadSoon = (): void => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, BOARD_TURN_RELOAD_DELAY_MS);
  };
  watch(
    () => new Map([...activity.entries()].map(([session, state]) => [session, state.working])),
    (now, before) => {
      if (finishedTurns(before, now).length > 0) reloadSoon();
    },
  );
  onUnmounted(() => clearTimeout(reloadTimer));

  return computed(() => withLiveCells(repos.value, activity));
}
