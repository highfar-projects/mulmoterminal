import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { getTerminalWidthTable, setTerminalWidthTable } from "./terminalUnicodeVersion";

// The server holds the answer until its boot measurement ends, which it bounds below this.
const WIDTHS_REQUEST_TIMEOUT_MS = 20_000;

let inFlight = false;

/** For a page whose /api/config came before the server finished measuring tmux: ask once more, and
 *  adopt a table that arrives. Terminals already open pick it up through the ref. A failed ask is
 *  asked again by the next config without a table; a table already adopted is never replaced. */
export async function adoptLateTerminalWidthTable(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetchWithTimeout("/api/config/terminal-widths", undefined, WIDTHS_REQUEST_TIMEOUT_MS);
    if (!res.ok) return;
    const { terminalWidthTable } = await jsonBody(res);
    if (getTerminalWidthTable() === null && terminalWidthTable !== null && terminalWidthTable !== undefined) setTerminalWidthTable(terminalWidthTable);
  } catch {
    // best-effort: the terminals keep the built-in table they already count with
  } finally {
    inFlight = false;
  }
}
