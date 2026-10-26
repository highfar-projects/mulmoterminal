import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { setTerminalWidthTable } from "./terminalUnicodeVersion";

// The server holds the answer until its boot measurement ends, which it bounds below this.
const WIDTHS_REQUEST_TIMEOUT_MS = 20_000;

let asked = false;

/** For a page whose /api/config came before the server finished measuring tmux: ask once more, and
 *  adopt a table that arrives. Terminals already open pick it up through the ref. */
export async function adoptLateTerminalWidthTable(): Promise<void> {
  if (asked) return;
  asked = true;
  try {
    const res = await fetchWithTimeout("/api/config/terminal-widths", undefined, WIDTHS_REQUEST_TIMEOUT_MS);
    if (!res.ok) return;
    const { terminalWidthTable } = await jsonBody(res);
    if (terminalWidthTable !== null && terminalWidthTable !== undefined) setTerminalWidthTable(terminalWidthTable);
  } catch {
    // best-effort: the terminals keep the built-in table they already count with
  }
}
