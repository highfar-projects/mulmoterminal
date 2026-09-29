import { describe, it, expect, vi } from "vitest";
import { toggleFocusMode } from "../../../src/composables/focusMode";

// #2580. Focus mode: full screen, and the keyboard locked where the browser allows it.
function env(opts: { fullscreen?: boolean; refuse?: boolean; keyboard?: unknown } = {}) {
  const requestFullscreen = vi.fn(async () => {
    if (opts.refuse) throw new Error("denied");
  });
  const exitFullscreen = vi.fn(async () => undefined);
  const doc = {
    fullscreenElement: opts.fullscreen ? ({} as Element) : null,
    exitFullscreen,
    documentElement: { requestFullscreen } as unknown as HTMLElement,
  };
  return { doc, requestFullscreen, exitFullscreen, keyboard: opts.keyboard };
}

describe("toggleFocusMode", () => {
  it("goes full screen and locks the keyboard where it can", async () => {
    const lock = vi.fn(async () => undefined);
    const e = env({ keyboard: { lock } });
    expect(await toggleFocusMode(e)).toBe("locked");
    expect(e.requestFullscreen).toHaveBeenCalled();
    expect(lock).toHaveBeenCalled();
  });

  it("stays full screen and says so when the browser has no Keyboard Lock", async () => {
    expect(await toggleFocusMode(env({ keyboard: undefined }))).toBe("fullscreen-only");
  });

  it("stays full screen when the lock itself is refused", async () => {
    const e = env({ keyboard: { lock: vi.fn(async () => Promise.reject(new Error("no"))) } });
    expect(await toggleFocusMode(e)).toBe("fullscreen-only");
  });

  it("reports a refused full screen and locks nothing", async () => {
    const lock = vi.fn(async () => undefined);
    expect(await toggleFocusMode(env({ refuse: true, keyboard: { lock } }))).toBe("refused");
    expect(lock).not.toHaveBeenCalled();
  });

  it("leaves full screen when already in it", async () => {
    const e = env({ fullscreen: true });
    expect(await toggleFocusMode(e)).toBe("left");
    expect(e.exitFullscreen).toHaveBeenCalled();
    expect(e.requestFullscreen).not.toHaveBeenCalled();
  });
});
