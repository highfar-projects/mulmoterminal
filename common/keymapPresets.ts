// The recommended keymap per platform (#2581), applied from Settings → Keyboard shortcuts. The sets
// are the keys skill's starter sets: a Mac gets the Up/Down pair (Option+Left/Right usually carry
// word motion in its terminals) and the line-editing `send` entries a Mac hand expects; Windows and
// Linux get all four arrows.
//
// Pure: a keymap and a platform in, the keymap with the set added and a list of what changed out.
// A preset only ADDS: an action the user has bound keeps its key, and a key already claimed by any
// binding (as a whole keystroke or as the first of two) is not claimed again.
import { KEYMAP_ACTIONS, parseKeySequence, type Keymap, type KeymapAction, type KeyBinding, type ReservedPlatform, type SendBinding } from "./keymap.js";

export interface KeymapPreset {
  actions: Partial<Record<KeymapAction, string>>;
  send: SendBinding[];
}

export const KEYMAP_PRESETS: Record<ReservedPlatform, KeymapPreset> = {
  mac: {
    actions: { "zoom-toggle": "Alt+ArrowUp", "next-attention": "Alt+ArrowDown" },
    send: [
      { key: "Cmd+ArrowLeft", bytes: "\u0001" },
      { key: "Cmd+ArrowRight", bytes: "\u0005" },
      { key: "Cmd+Backspace", bytes: "\u0015" },
    ],
  },
  other: {
    actions: { "zoom-toggle": "Alt+ArrowUp", "next-attention": "Alt+ArrowDown", "zoom-prev": "Alt+ArrowLeft", "zoom-next": "Alt+ArrowRight" },
    send: [],
  },
};

/** One line of what applying a preset does, for the list shown before it is applied. */
export type PresetChange =
  | { kind: "add"; action: KeymapAction; binding: string }
  | { kind: "add-send"; binding: string; bytes: string }
  | { kind: "kept"; action: KeymapAction; binding: string; current: string }
  | { kind: "kept-send"; binding: string }
  | { kind: "taken"; action: KeymapAction | "send"; binding: string };

const strokeId = (stroke: KeyBinding): string => `${stroke.meta}|${stroke.ctrl}|${stroke.alt}|${stroke.shift}|${stroke.key}`;

/** The first keystroke of every binding in `keymap`: a new single key there would never fire (a
 *  sequence starting with it waits, or the binding on it wins). */
function claimedStrokes(keymap: Keymap): Set<string> {
  return new Set([...actionBindings(keymap), ...(keymap.send ?? []).map((entry) => entry.key)].flatMap((binding) => firstStroke(binding) ?? []));
}

const actionBindings = (keymap: Keymap): string[] =>
  Object.entries(keymap).flatMap(([name, value]) => (name !== "send" && typeof value === "string" ? [value] : []));

const firstStroke = (binding: string): string | null => {
  const strokes = parseKeySequence(binding);
  return strokes?.[0] ? strokeId(strokes[0]) : null;
};

function actionChange(keymap: Keymap, claimed: Set<string>, action: KeymapAction, binding: string): PresetChange {
  const current = keymap[action];
  if (current !== undefined) return { kind: "kept", action, binding, current };
  const stroke = firstStroke(binding);
  if (stroke === null || claimed.has(stroke)) return { kind: "taken", action, binding };
  claimed.add(stroke);
  return { kind: "add", action, binding };
}

function sendChange(keymap: Keymap, claimed: Set<string>, entry: SendBinding): PresetChange {
  const stroke = firstStroke(entry.key);
  if (sendFires(keymap, stroke, entry.bytes)) return { kind: "kept-send", binding: entry.key };
  if (stroke === null || claimed.has(stroke)) return { kind: "taken", action: "send", binding: entry.key };
  claimed.add(stroke);
  return { kind: "add-send", binding: entry.key, bytes: entry.bytes };
}

/** The key already sends these bytes — the set applied before, or the same entry written by hand. It
 *  must be the entry that FIRES: the first `send` on the key wins, and an action on it wins over any. */
function sendFires(keymap: Keymap, stroke: string | null, bytes: string): boolean {
  if (stroke === null || actionBindings(keymap).some((binding) => firstStroke(binding) === stroke)) return false;
  const own = (keymap.send ?? []).find((entry) => firstStroke(entry.key) === stroke);
  return own !== undefined && parseKeySequence(own.key)?.length === 1 && own.bytes === bytes;
}

/** What applying `preset` to `keymap` would do: its actions in the keymap's action order, then its
 *  `send` entries. */
export function presetChanges(keymap: Keymap, preset: KeymapPreset): PresetChange[] {
  const claimed = claimedStrokes(keymap);
  const actions = KEYMAP_ACTIONS.flatMap((action) => {
    const binding = preset.actions[action];
    return binding === undefined ? [] : [actionChange(keymap, claimed, action, binding)];
  });
  return [...actions, ...preset.send.map((entry) => sendChange(keymap, claimed, entry))];
}

/** The whole keymap after the preset's additions — what is written to the config. */
export function withPreset(keymap: Keymap, changes: PresetChange[]): Keymap {
  const next: Keymap = { ...keymap };
  const send = [...(keymap.send ?? [])];
  changes.forEach((change) => {
    if (change.kind === "add") next[change.action] = change.binding;
    if (change.kind === "add-send") send.push({ key: change.binding, bytes: change.bytes });
  });
  return send.length ? { ...next, send } : next;
}
