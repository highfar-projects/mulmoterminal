// Which Unicode width table the browser's xterm counts cells with. xterm's default is "6", where an
// emoji such as `✅` is one cell; Claude Code and psmux count it as two. The table has to agree
// with the tmux in between, or every emoji shifts the rest of its row one column. psmux always
// counts two; a real tmux counts by its own locale tables, so the server asks it at boot
// (tmuxCountsEmojiWide) — two on tmux 3.6 under glibc's C.UTF-8, for one. A tmux that counts one
// keeps xterm's default, which is what it has always run on.
export const TERMINAL_UNICODE_VERSIONS = ["6", "11"] as const;

export type TerminalUnicodeVersion = (typeof TERMINAL_UNICODE_VERSIONS)[number];

export const DEFAULT_TERMINAL_UNICODE_VERSION: TerminalUnicodeVersion = "6";

export const isTerminalUnicodeVersion = (value: unknown): value is TerminalUnicodeVersion => TERMINAL_UNICODE_VERSIONS.some((version) => version === value);

export const terminalUnicodeVersionFor = (emojiWide: boolean): TerminalUnicodeVersion => (emojiWide ? "11" : DEFAULT_TERMINAL_UNICODE_VERSION);
