import { ref } from "vue";

// Whether the "Viewing history" banner is drawn while a pane is in tmux copy-mode.
//
// On by default: the banner is what stops copy-mode reading as "the terminal stopped taking
// input" (#2207). The switch is for someone who scrolls up to read all the time and finds the
// banner covering the line they came for (#3212). Copy-mode itself is untouched, and `q` still
// leaves it.
//
// Per browser, like the scroll speed beside it: it is about the person reading, not the host.
const STORAGE_KEY = "copyModeBanner";
const DEFAULT_SHOWN = true;

// Only the exact string "0" hides it: unset, corrupt, or a value from a future version keeps the
// banner, because the safe failure is the one that still explains why typing does nothing.
function loadShown(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_SHOWN : stored !== "0";
  } catch {
    return DEFAULT_SHOWN;
  }
}

const shown = ref<boolean>(loadShown());

export function useCopyModeBanner() {
  function setCopyModeBanner(next: boolean) {
    shown.value = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // storage blocked: the choice still applies for this session, just isn't persisted
    }
  }
  return { copyModeBanner: shown, setCopyModeBanner };
}
