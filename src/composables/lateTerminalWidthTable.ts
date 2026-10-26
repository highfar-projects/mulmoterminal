import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { setTerminalWidthTable, terminalWidthTableGeneration } from "./terminalUnicodeVersion";

// The server holds the answer until its boot measurement ends, which it bounds below this.
const WIDTHS_REQUEST_TIMEOUT_MS = 20_000;

let askingFor: number | null = null;

/** For a page whose /api/config came before the server finished measuring tmux: ask once more, and
 *  adopt a table that arrives — unless anything set the table meanwhile (a newer config, perhaps
 *  from a restarted server), which also gets its own ask. A failed ask is asked again by the next
 *  config without a table. Terminals already open pick the table up through the ref. */
export async function adoptLateTerminalWidthTable(): Promise<void> {
  const generation = terminalWidthTableGeneration();
  if (askingFor === generation) return;
  askingFor = generation;
  try {
    const res = await fetchWithTimeout("/api/config/terminal-widths", undefined, WIDTHS_REQUEST_TIMEOUT_MS);
    if (!res.ok) return;
    const { terminalWidthTable } = await jsonBody(res);
    if (terminalWidthTableGeneration() === generation && terminalWidthTable !== null && terminalWidthTable !== undefined) {
      setTerminalWidthTable(terminalWidthTable);
    }
  } catch {
    // best-effort: the terminals keep the built-in table they already count with
  } finally {
    if (askingFor === generation) askingFor = null;
  }
}
