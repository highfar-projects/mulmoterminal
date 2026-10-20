import { ref } from "vue";
import { DEFAULT_TERMINAL_UNICODE_VERSION, isTerminalUnicodeVersion, type TerminalUnicodeVersion } from "../../common/terminalUnicode";

// The width table every terminal counts cells with, hydrated from /api/config. A ref so the
// terminal manager can carry a late answer to terminals built before the config arrived.
const unicodeVersion = ref<TerminalUnicodeVersion>(DEFAULT_TERMINAL_UNICODE_VERSION);

export const getTerminalUnicodeVersion = (): TerminalUnicodeVersion => unicodeVersion.value;

export const setTerminalUnicodeVersion = (value: unknown): void => {
  unicodeVersion.value = isTerminalUnicodeVersion(value) ? value : DEFAULT_TERMINAL_UNICODE_VERSION;
};
