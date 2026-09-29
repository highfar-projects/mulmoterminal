// Focus mode (#2580): the app full screen, with the browser's tab keys locked where it allows it — so
// Cmd+W / Ctrl+W and the other keys a browser keeps for its tabs reach MulmoTerminal's keymap.
//
// Only those keys are locked. Locking the whole keyboard would also take Esc, and a held Esc (the
// only way out then) repeats into the terminal as a burst of escapes before the browser gives up.
import { ref } from "vue";
import { isRecord } from "../../common/isRecord";

/** The keys a browser keeps for its tabs and windows (`W`, `T`, `N` with Cmd or Ctrl, and Shift+T). */
export const FOCUS_MODE_LOCKED_KEYS: readonly string[] = ["KeyW", "KeyT", "KeyN"];

/**
 * What a toggle did: entered with the keys captured; entered without (the browser has no Keyboard
 * Lock, or refused it); entered without because the page is not a secure context, where no browser
 * offers it; left; or full screen was refused.
 */
export type FocusModeOutcome = "locked" | "unlocked" | "insecure" | "left" | "refused";

interface KeyboardLock {
  lock: (keyCodes?: string[]) => Promise<void>;
  unlock?: () => void;
}

const isKeyboardLock = (value: unknown): value is KeyboardLock => isRecord(value) && typeof value.lock === "function";

export interface FocusModeEnv {
  doc: Pick<Document, "fullscreenElement" | "exitFullscreen" | "documentElement">;
  /** `navigator.keyboard`, when the browser has it. */
  keyboard: unknown;
  /** `window.isSecureContext`: Keyboard Lock exists only there. */
  secure: boolean;
}

/** Hand the tab keys back to the browser. Safe to call when nothing is locked. */
export function releaseFocusModeKeys(keyboard: unknown): void {
  if (isKeyboardLock(keyboard)) keyboard.unlock?.();
}

async function lockTabKeys(env: FocusModeEnv): Promise<FocusModeOutcome> {
  if (!isKeyboardLock(env.keyboard)) return env.secure ? "unlocked" : "insecure";
  try {
    await env.keyboard.lock([...FOCUS_MODE_LOCKED_KEYS]);
    return "locked";
  } catch {
    return "unlocked";
  }
}

/** Enter focus mode, or leave it when already in. Needs a user gesture to enter — a key or a click. */
export async function toggleFocusMode(env: FocusModeEnv): Promise<FocusModeOutcome> {
  if (env.doc.fullscreenElement) {
    releaseFocusModeKeys(env.keyboard);
    await env.doc.exitFullscreen().catch(() => undefined);
    return "left";
  }
  try {
    await env.doc.documentElement.requestFullscreen();
  } catch {
    return "refused";
  }
  return lockTabKeys(env);
}

/** The outcome to tell the user, while it is shown. Nothing for leaving: the screen says that itself. */
export const focusModeNotice = ref<Exclude<FocusModeOutcome, "left"> | null>(null);

const NOTICE_MS = 4000;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** Show what a toggle did for a few seconds; leaving clears whatever was shown. */
export function showFocusModeOutcome(outcome: FocusModeOutcome): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  focusModeNotice.value = outcome === "left" ? null : outcome;
  noticeTimer = setTimeout(() => (focusModeNotice.value = null), NOTICE_MS);
}

const currentKeyboard = (): unknown => Reflect.get(navigator, "keyboard");

// Esc (or the browser's own menu) leaves full screen without going through the toggle, so the lock
// is released there too rather than left for the next full screen to inherit.
let watchingExit = false;
function watchFullscreenExit(): void {
  if (watchingExit) return;
  watchingExit = true;
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) return;
    releaseFocusModeKeys(currentKeyboard());
    focusModeNotice.value = null;
  });
}

/** The keymap action and the palette entry. */
export async function runFocusMode(): Promise<void> {
  watchFullscreenExit();
  showFocusModeOutcome(await toggleFocusMode({ doc: document, keyboard: currentKeyboard(), secure: window.isSecureContext }));
}
