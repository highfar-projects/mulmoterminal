import type { Terminal } from "@xterm/xterm";
import { getTerminalUnicodeVersion, getTerminalWidthTable } from "./terminalUnicodeVersion";
import { tmuxUnicodeProvider, TMUX_UNICODE_VERSION } from "../../common/tmuxUnicodeProvider";

/** The server tmux's measured table when it sent one (#3173), else the built-in table it named. A table
 *  that arrives later is registered then: registering replaces the provider of the same version. */
export function applyCellWidths(term: Terminal): void {
  const table = getTerminalWidthTable();
  if (table) term.unicode.register(tmuxUnicodeProvider(table));
  term.unicode.activeVersion = table ? TMUX_UNICODE_VERSION : getTerminalUnicodeVersion();
}

/** For a terminal already showing a screen: xterm keeps the cells it parsed under the old table, so
 *  tmux is asked to repaint it. */
export function reapplyCellWidths(term: Terminal, ws: WebSocket | null): void {
  applyCellWidths(term);
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "redraw" }));
}
