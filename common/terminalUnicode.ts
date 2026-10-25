// Which width table the browser's xterm counts cells with when the tmux on this server has not been
// measured (tmuxWidthTable.ts) — behind psmux, with no tmux at all, or before the boot probe ends.
// xterm's own default is "6", where an emoji such as `✅` is one cell; tmux 3.6 (utf8proc or the C
// library), psmux and Claude Code's `Bun.stringWidth` all count it as two, and "11" agrees with them
// on far more characters than "6" does (#3173). A measured table replaces this whenever there is one.
export const TERMINAL_UNICODE_VERSIONS = ["6", "11"] as const;

export type TerminalUnicodeVersion = (typeof TERMINAL_UNICODE_VERSIONS)[number];

export const DEFAULT_TERMINAL_UNICODE_VERSION: TerminalUnicodeVersion = "11";

export const isTerminalUnicodeVersion = (value: unknown): value is TerminalUnicodeVersion => TERMINAL_UNICODE_VERSIONS.some((version) => version === value);
