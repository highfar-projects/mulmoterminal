// The toolbar's attention-sound button has three states, not two. "On" and "off" are the user's
// setting; the third is the browser refusing to play until the page has been clicked, which the
// button used to render as plain "on" — so it said sound was working while notifications were
// being lost (#1152).
//
// Same shape as sortModeButton: the .vue asks for icon + label and renders them.

export interface SoundButtonState {
  icon: string;
  /** A message key: the component says it in the UI's language. */
  labelKey: "tips.toolbar.soundOff" | "tips.toolbar.soundBlocked" | "tips.toolbar.soundOn";
  /** Whether the button reads as pressed. Blocked is still "on", so it stays true. */
  active: boolean;
  /** Which active fill to use: blocked is a warning, not a selection. */
  tone: "accent" | "warn";
}

// A silent speaker with no slash, rather than a second off-looking icon: the setting IS on, and a
// suspended AudioContext makes no sound yet. Reusing `volume_off` would make the blocked state
// indistinguishable from the one the user chose.
const BLOCKED_ICON = "volume_mute";

export function soundButtonState(enabled: boolean, blocked: boolean): SoundButtonState {
  if (!enabled) return { icon: "volume_off", labelKey: "tips.toolbar.soundOff", active: false, tone: "accent" };
  if (blocked) return { icon: BLOCKED_ICON, labelKey: "tips.toolbar.soundBlocked", active: true, tone: "warn" };
  return { icon: "volume_up", labelKey: "tips.toolbar.soundOn", active: true, tone: "accent" };
}
