// A keystroke pressed in Settings, written the way `keymap` spells a binding (#2619) — the inverse of
// parseKeyBinding, so what is recorded is exactly what the running app will match.
import type { KeymapKeyEvent } from "./keymap.js";

// A modifier pressed on its own is the start of a chord, not a key: keep listening.
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS", "AltGraph", "CapsLock", "Fn", "FnLock", "Hyper", "Super"]);

export type RecordedKey = { binding: string } | { pending: true } | { unusable: "whitespace" | "unidentified" | "plus" | "numpad" };

// KeyboardEvent.DOM_KEY_LOCATION_NUMPAD, spelled out so this module needs no DOM.
const NUMPAD_LOCATION = 3;

export function bindingFromEvent(e: KeymapKeyEvent & { location?: number }): RecordedKey {
  if (MODIFIER_KEYS.has(e.key)) return { pending: true };
  // A binding cannot name a key with whitespace in it (the space bar reports " "), and a key the
  // browser could not name matches nothing.
  if (e.key === "" || /\s/.test(e.key)) return { unusable: "whitespace" };
  if (e.key === "Unidentified" || e.key === "Dead") return { unusable: "unidentified" };
  // A binding names the key, not where it is: a numpad "1" would also fire for the main-row "1".
  if (e.location === NUMPAD_LOCATION) return { unusable: "numpad" };
  // `+` is the separator a binding is written with, so a binding cannot name the key itself.
  if (e.key === "+") return { unusable: "plus" };
  const modifiers = [e.metaKey ? "Cmd" : null, e.ctrlKey ? "Ctrl" : null, e.altKey ? "Alt" : null, e.shiftKey ? "Shift" : null].filter(
    (part): part is string => part !== null,
  );
  return { binding: [...modifiers, e.key].join("+") };
}
