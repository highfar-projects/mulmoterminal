// @vitest-environment node
import { describe, it, expect } from "vitest";
import { bindingFromEvent } from "../../common/keyRecording";
import { matchesBinding, parseKeyBinding, type KeymapKeyEvent } from "../../common/keymap";

const KEYS = ["a", "A", "f", "1", "PageDown", "ArrowLeft", "Enter", "Escape", "F5", "/", "=", "[", "é", "Backspace", "Tab"];
const FLAGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const eventOf = (key: string, flags: number): KeymapKeyEvent => ({
  key,
  metaKey: !!(flags & 1),
  ctrlKey: !!(flags & 2),
  altKey: !!(flags & 4),
  shiftKey: !!(flags & 8),
});

describe("bindingFromEvent", () => {
  it("writes what parseKeyBinding reads back as the very same keystroke, for every key and modifier set", () => {
    let checked = 0;
    KEYS.forEach((key) =>
      FLAGS.forEach((flags) => {
        const e = eventOf(key, flags);
        const recorded = bindingFromEvent(e);
        expect("binding" in recorded).toBe(true);
        if (!("binding" in recorded)) return;
        const parsed = parseKeyBinding(recorded.binding);
        expect(parsed, recorded.binding).not.toBeNull();
        if (parsed) expect(matchesBinding(parsed, e)).toBe(true);
        checked += 1;
      }),
    );
    expect(checked).toBe(KEYS.length * FLAGS.length);
  });

  it("spells the modifiers the way the guide does", () => {
    expect(bindingFromEvent(eventOf("f", 1 | 8))).toEqual({ binding: "Cmd+Shift+f" });
    expect(bindingFromEvent(eventOf("PageDown", 2 | 4))).toEqual({ binding: "Ctrl+Alt+PageDown" });
    expect(bindingFromEvent(eventOf("PageDown", 0))).toEqual({ binding: "PageDown" });
  });

  it("keeps listening while only a modifier is down", () => {
    ["Shift", "Control", "Alt", "Meta", "CapsLock"].forEach((key) => expect(bindingFromEvent(eventOf(key, 8))).toEqual({ pending: true }));
  });

  it("refuses a key a binding cannot name", () => {
    expect(bindingFromEvent(eventOf(" ", 0))).toEqual({ unusable: "whitespace" });
    expect(bindingFromEvent(eventOf("", 0))).toEqual({ unusable: "whitespace" });
    expect(bindingFromEvent(eventOf("Unidentified", 0))).toEqual({ unusable: "unidentified" });
    expect(bindingFromEvent(eventOf("Dead", 4))).toEqual({ unusable: "unidentified" });
    // The separator itself: a binding naming it would parse as nothing and never fire.
    expect(bindingFromEvent(eventOf("+", 8))).toEqual({ unusable: "plus" });
    // A numpad key would also fire for the same key on the main row.
    expect(bindingFromEvent({ ...eventOf("1", 0), location: 3 })).toEqual({ unusable: "numpad" });
    expect(bindingFromEvent({ ...eventOf("1", 0), location: 0 })).toEqual({ binding: "1" });
    expect(parseKeyBinding("Shift++")).toBeNull();
  });
});
