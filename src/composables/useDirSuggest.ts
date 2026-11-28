import { onScopeDispose, ref, shallowRef, watch } from "vue";
import { DIR_SUGGEST_ROUTE, isDirSuggestResponse, type DirSuggestResponse } from "../../common/dirSuggest";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// How long the field has to sit still before it is asked about. Typing a path is a burst, and
// suggestions that reshuffle under every keystroke are noise rather than help.
export const DIR_SUGGEST_IDLE_MS = 1_000;

// null is "could not tell" — a failed read, an older server, a malformed body.
async function fetchDirSuggest(typed: string): Promise<DirSuggestResponse | null> {
  try {
    const response = await fetchWithTimeout(`${DIR_SUGGEST_ROUTE}?path=${encodeURIComponent(typed)}`);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isDirSuggestResponse(body) ? body : null;
  } catch {
    return null;
  }
}

// The Working directory field's completions and its "this is not there" verdict. Both describe the
// text the answer was asked for, so both go the moment the text changes, and an answer for text
// the user has since typed past is dropped rather than shown under the new text.
export function useDirSuggest(typed: () => string) {
  const suggestions = shallowRef<string[]>([]);
  const missing = ref(false);
  let latestAsk = 0;
  let requestedPath: string | null = null;
  let answer: DirSuggestResponse | null = null;
  let answered = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  function settle(reply: DirSuggestResponse | null): void {
    answer = reply;
    answered = true;
    suggestions.value = reply?.suggestions ?? [];
    missing.value = reply?.exists === false;
  }

  async function ask(path: string): Promise<DirSuggestResponse | null> {
    clearIdleTimer();
    const thisAsk = ++latestAsk;
    requestedPath = path;
    answered = false;
    const reply = path.trim() ? await fetchDirSuggest(path.trim()) : null;
    if (thisAsk === latestAsk) settle(reply);
    return reply;
  }

  function forget(): void {
    latestAsk++;
    clearIdleTimer();
    requestedPath = null;
    answered = false;
    suggestions.value = [];
    missing.value = false;
  }

  // A path that `ask` was already called with (an accepted suggestion) is not asked about again.
  watch(typed, (path) => {
    if (path === requestedPath) return;
    forget();
    if (path.trim()) idleTimer = setTimeout(() => void ask(path), DIR_SUGGEST_IDLE_MS);
  });

  // For a launch pressed before the idle timer fired. "Could not tell" lets the launch through:
  // the server refuses a missing directory on its own, so blocking here would only add a failure.
  async function confirmLaunchable(path: string): Promise<boolean> {
    const reply = answered && requestedPath === path ? answer : await ask(path);
    return reply?.exists !== false;
  }

  const dismiss = (): void => {
    suggestions.value = [];
  };

  onScopeDispose(clearIdleTimer);
  return { suggestions, missing, ask, confirmLaunchable, dismiss };
}
