import { ref, shallowRef } from "vue";
import { DEFAULT_TERMINAL_UNICODE_VERSION, isTerminalUnicodeVersion, type TerminalUnicodeVersion } from "../../common/terminalUnicode";
import { isTmuxWidthTable, type TmuxWidthTable } from "../../common/tmuxWidthTable";

// How every terminal counts cells, hydrated from /api/config: the server tmux's own measured table
// when there is one, else a built-in xterm table. Refs so the terminal manager can carry a late
// answer to terminals built before the config arrived.
const unicodeVersion = ref<TerminalUnicodeVersion>(DEFAULT_TERMINAL_UNICODE_VERSION);
const widthTable = shallowRef<TmuxWidthTable | null>(null);

export const getTerminalUnicodeVersion = (): TerminalUnicodeVersion => unicodeVersion.value;

export const setTerminalUnicodeVersion = (value: unknown): void => {
  unicodeVersion.value = isTerminalUnicodeVersion(value) ? value : DEFAULT_TERMINAL_UNICODE_VERSION;
};

export const getTerminalWidthTable = (): TmuxWidthTable | null => widthTable.value;

// Bumped on every set, so an answer to a request made earlier can tell that a newer one landed.
let widthTableGeneration = 0;

export const terminalWidthTableGeneration = (): number => widthTableGeneration;

export const setTerminalWidthTable = (value: unknown): void => {
  widthTableGeneration += 1;
  widthTable.value = isTmuxWidthTable(value) ? value : null;
};
