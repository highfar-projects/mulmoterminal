// Focus mode (#2580): the app full screen, with the keyboard locked where the browser allows it — so
// Cmd+W / Ctrl+W and the other keys a browser keeps for its tabs reach MulmoTerminal's keymap, and
// Escape reaches the terminal (a long press still leaves full screen; the browser says so).
//
// Keyboard Lock is Chromium's; elsewhere the screen is still full, and the notice says the keys are
// not captured, rather than letting a user find out by closing their tab.
import { ref } from "vue";
import { isRecord } from "../../common/isRecord";

/** What a toggle did: entered with the keys captured, entered without, left, or was refused. */
export type FocusModeOutcome = "locked" | "fullscreen-only" | "left" | "refused";

interface KeyboardLock {
  lock: () => Promise<void>;
}

const isKeyboardLock = (value: unknown): value is KeyboardLock => isRecord(value) && typeof value.lock === "function";

export interface FocusModeEnv {
  doc: Pick<Document, "fullscreenElement" | "exitFullscreen" | "documentElement">;
  /** `navigator.keyboard`, when the browser has it. */
  keyboard: unknown;
}

/** Enter focus mode, or leave it when already in. Needs a user gesture to enter — a key or a click. */
export async function toggleFocusMode(env: FocusModeEnv): Promise<FocusModeOutcome> {
  if (env.doc.fullscreenElement) {
    await env.doc.exitFullscreen().catch(() => undefined);
    return "left";
  }
  try {
    await env.doc.documentElement.requestFullscreen();
  } catch {
    return "refused";
  }
  if (!isKeyboardLock(env.keyboard)) return "fullscreen-only";
  try {
    await env.keyboard.lock();
    return "locked";
  } catch {
    return "fullscreen-only";
  }
}

/** The outcome to tell the user, while it is shown. Nothing for leaving: the screen says that itself. */
export const focusModeNotice = ref<Exclude<FocusModeOutcome, "left"> | null>(null);

const NOTICE_MS = 4000;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** The keymap action and the palette entry. */
export async function runFocusMode(): Promise<void> {
  const outcome = await toggleFocusMode({ doc: document, keyboard: Reflect.get(navigator, "keyboard") });
  if (noticeTimer) clearTimeout(noticeTimer);
  focusModeNotice.value = outcome === "left" ? null : outcome;
  noticeTimer = setTimeout(() => (focusModeNotice.value = null), NOTICE_MS);
}
