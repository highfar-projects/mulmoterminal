// Settings → Keyboard shortcuts, out of the locale file, which is at its line cap.
import { keymapPresetEn } from "../keymapPreset/en";
import { shortcutActionsEn } from "../shortcutActions/en";

export const shortcutsEn = {
  preset: keymapPresetEn,
  intro:
    "Everything is listed whether it is bound or not, under {keymapKey}; the list is read-only, and the recommended keys below add a starter set without touching what you bound. Two kinds can be bound: MulmoTerminal actions (enlarge, jump to a waiting agent, copy / paste), and key sequences sent to the terminal (on a Mac, Cmd+← for start of line). Every key you bind stops reaching the program inside the terminal, so set them up with the button below — the agent checks each one against your existing bindings and the traps a browser or a Mac adds before writing it. The {guide} has the reference.",
  guide: "guide",
  actions: shortcutActionsEn,
  list: "Keyboard shortcuts",
  notSet: "Not set",
  reservedChip: "never fires",
  reservedTip:
    "The browser keeps this key for its tabs and windows, so the page never receives it. Use a key it lets through, such as a two-key binding like {example}.",
  reservedTipSingle:
    "The browser keeps this key for its tabs and windows, so the page never receives it. This action takes one key, so pick another single key the browser lets through.",
  reservedNote:
    "This browser keeps these for its tabs and windows, so they never reach MulmoTerminal: {keys}. For most actions, a two-key binding such as {example} reaches the same one. Focus mode (Chrome, Edge, Arc) hands them to MulmoTerminal while it is on.",
  sendRow: "Send {key} to the terminal",
  sendNone: "Send keys to the terminal",
  setUp: "Set up shortcuts…",
};
