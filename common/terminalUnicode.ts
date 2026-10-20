// Which Unicode width table the browser's xterm counts cells with. xterm's default is "6", where an
// emoji such as `✅` is one cell; Claude Code and psmux count it as two. psmux repaints only the
// cells it thinks changed, so on it every emoji shifts the rest of its row one column — "11"
// agrees with them. A real tmux keeps xterm's default, which is what it has always run on.
export const TERMINAL_UNICODE_VERSIONS = ["6", "11"] as const;

export type TerminalUnicodeVersion = (typeof TERMINAL_UNICODE_VERSIONS)[number];

export const DEFAULT_TERMINAL_UNICODE_VERSION: TerminalUnicodeVersion = "6";

export const isTerminalUnicodeVersion = (value: unknown): value is TerminalUnicodeVersion => TERMINAL_UNICODE_VERSIONS.some((version) => version === value);

export const terminalUnicodeVersionFor = (psmux: boolean): TerminalUnicodeVersion => (psmux ? "11" : DEFAULT_TERMINAL_UNICODE_VERSION);
