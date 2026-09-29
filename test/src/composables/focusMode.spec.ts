import { describe, it, expect, vi, afterEach } from "vitest";
import { FOCUS_MODE_LOCKED_KEYS, focusModeNotice, releaseFocusModeKeys, showFocusModeOutcome, toggleFocusMode } from "../../../src/composables/focusMode";

// #2580. Focus mode: full screen, and the browser's tab keys locked where the browser allows it.
function env(opts: { fullscreen?: boolean; refuse?: boolean; keyboard?: unknown; secure?: boolean } = {}) {
  const requestFullscreen = vi.fn(async () => {
    if (opts.refuse) throw new Error("denied");
  });
  const exitFullscreen = vi.fn(async () => undefined);
  const doc = {
    fullscreenElement: opts.fullscreen ? ({} as Element) : null,
    exitFullscreen,
    documentElement: { requestFullscreen } as unknown as HTMLElement,
  };
  return { doc, requestFullscreen, exitFullscreen, keyboard: opts.keyboard, secure: opts.secure ?? true };
}
const keyboard = (lockFails = false) => ({
  lock: vi.fn<(keyCodes?: string[]) => Promise<void>>(async () => (lockFails ? Promise.reject(new Error("no")) : undefined)),
  unlock: vi.fn(),
});

describe("toggleFocusMode", () => {
  it("goes full screen and locks the tab keys where it can", async () => {
    const kb = keyboard();
    const e = env({ keyboard: kb });
    expect(await toggleFocusMode(e)).toBe("locked");
    expect(e.requestFullscreen).toHaveBeenCalled();
    expect(kb.lock).toHaveBeenCalledWith([...FOCUS_MODE_LOCKED_KEYS]);
  });

  // Locking with no list takes Esc as well, and the held Esc that then leaves full screen repeats
  // into the terminal. Only the tab keys are asked for.
  it("never locks Escape", async () => {
    const kb = keyboard();
    await toggleFocusMode(env({ keyboard: kb }));
    expect(kb.lock.mock.calls[0]?.[0]).toEqual(["KeyW", "KeyT", "KeyN"]);
  });

  it("stays full screen and says so when the browser has no Keyboard Lock", async () => {
    expect(await toggleFocusMode(env({ keyboard: undefined }))).toBe("unlocked");
  });

  it("stays full screen when the lock itself is refused", async () => {
    expect(await toggleFocusMode(env({ keyboard: keyboard(true) }))).toBe("unlocked");
  });

  // Keyboard Lock is a secure-context API, so plain http from another machine lacks it in every
  // browser; saying "use Chrome" there would be wrong.
  it("blames the page's context, not the browser, when it is not secure", async () => {
    expect(await toggleFocusMode(env({ keyboard: undefined, secure: false }))).toBe("insecure");
  });

  it("reports a refused full screen and locks nothing", async () => {
    const kb = keyboard();
    expect(await toggleFocusMode(env({ refuse: true, keyboard: kb }))).toBe("refused");
    expect(kb.lock).not.toHaveBeenCalled();
  });

  it("leaves full screen when already in it, handing the keys back", async () => {
    const kb = keyboard();
    const e = env({ fullscreen: true, keyboard: kb });
    expect(await toggleFocusMode(e)).toBe("left");
    expect(e.exitFullscreen).toHaveBeenCalled();
    expect(kb.unlock).toHaveBeenCalled();
    expect(e.requestFullscreen).not.toHaveBeenCalled();
  });
});

describe("releaseFocusModeKeys", () => {
  it.each([[undefined], [null], [{}], [{ lock: async () => undefined }]])("does nothing it cannot for %j", (kb) => {
    expect(() => releaseFocusModeKeys(kb)).not.toThrow();
  });
});

describe("showFocusModeOutcome", () => {
  afterEach(() => {
    vi.useRealTimers();
    focusModeNotice.value = null;
  });

  it.each([["locked"], ["unlocked"], ["insecure"], ["refused"]] as const)("shows %s for a few seconds", (outcome) => {
    vi.useFakeTimers();
    showFocusModeOutcome(outcome);
    expect(focusModeNotice.value).toBe(outcome);
    vi.runAllTimers();
    expect(focusModeNotice.value).toBeNull();
  });

  it("clears what was shown on leaving", () => {
    vi.useFakeTimers();
    showFocusModeOutcome("locked");
    showFocusModeOutcome("left");
    expect(focusModeNotice.value).toBeNull();
  });
});
