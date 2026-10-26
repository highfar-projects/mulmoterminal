// psmux (#3180) answers `#{w:}` with a codepoint count and drops a session on `respawn-pane -k`, so
// its widths are not asked per codepoint. They come from the crate psmux counts with
// (psmuxWidthRuns.ts), and that table and psmux's fold rule are CHECKED against psmux's own grid —
// one session per sample, read back with `#{cursor_x}` — before they are used.
import { PSMUX_UNICODE_WIDTH_VERSION, PSMUX_WIDTH_RUNS } from "../../../common/psmuxWidthRuns.js";
import { CLUSTER_SAMPLES, rowWidthOf } from "../../../common/tmuxClusters.js";
import type { TmuxWidthTable } from "../../../common/tmuxWidthTable.js";
import { serverVersion, sleep, type Measurement, type ThrowawayTmux } from "./throwawayTmux.js";

type Log = (line: string) => void;

const PSMUX_TABLE: TmuxWidthTable = { runs: PSMUX_WIDTH_RUNS, folding: "psmux", vs16Wide: true };
// Wide enough that no sample wraps; the sessions are never attached, so their size is all they have.
const PANE_COLUMNS = "200";
const PANE_ROWS = "5";
// Polled from several sessions at once, and each poll is a process start on Windows.
const SAMPLE_POLL_MS = 100;
const SAMPLE_POLL_LIMIT = 100;

/** The cluster samples, a flag followed by a third indicator (where psmux and tmux 3.6a part), and
 *  emoji added after Unicode 11 (where the crate's table and Unicode 11 part). */
export const PSMUX_SAMPLES: readonly string[] = [
  ...CLUSTER_SAMPLES,
  ...[[0x1f1ef, 0x1f1f5, 0x1f1fa], [0x1f971], [0x1fae0], [0x1fabf]].map((codepoints) => String.fromCodePoint(...codepoints)),
];

/** The table when psmux drew every sample where it predicts; null otherwise, including a sample it could not read. */
export function psmuxTableIfMatching(measured: readonly (number | null)[]): TmuxWidthTable | null {
  const predicted = PSMUX_SAMPLES.map((sample) => rowWidthOf(PSMUX_TABLE, sample));
  return predicted.length === measured.length && predicted.every((width, index) => width === measured[index]) ? PSMUX_TABLE : null;
}

// `node` is what this server runs on. The sample travels as hex, so whichever shell psmux starts
// the command in reads nothing in it.
export const psmuxPrintCommand = (text: string): string =>
  `node -e "process.stdout.write(Buffer.from('${Buffer.from(text, "utf8").toString("hex")}','hex'));setInterval(()=>{},1e9)"`;

async function cursorAfterMarker(tmux: ThrowawayTmux, session: string, marker: string): Promise<number | null> {
  for (let attempt = 0; attempt < SAMPLE_POLL_LIMIT; attempt++) {
    const row = await tmux.run(["capture-pane", "-p", "-t", session, "-S", "0", "-E", "0"]);
    if (row.ok && row.stdout.trimEnd().endsWith(marker)) {
      const cursor = await tmux.run(["display-message", "-p", "-t", session, "#{cursor_x}"]);
      return cursor.ok ? Number(cursor.stdout.trim()) - marker.length : null;
    }
    await sleep(SAMPLE_POLL_MS);
  }
  return null;
}

/** Columns psmux's grid gives `sample`, printed in a session of its own followed by a unique marker. */
export async function psmuxSampleWidth(tmux: ThrowawayTmux, sample: string, index: number): Promise<number | null> {
  const session = `mt-w-${index}`;
  const marker = `|${index}|`;
  const started = await tmux.run(["new-session", "-d", "-s", session, "-x", PANE_COLUMNS, "-y", PANE_ROWS, psmuxPrintCommand(sample + marker)]);
  if (!started.ok) return null;
  try {
    return await cursorAfterMarker(tmux, session, marker);
  } finally {
    await tmux.run(["kill-session", "-t", session]);
  }
}

export async function measurePsmuxWith(tmux: ThrowawayTmux, log: Log): Promise<Measurement | null> {
  // One session first, so the samples' sessions do not race each other to start the server.
  const started = await tmux.run(["-f", "NUL", "new-session", "-d", "-s", "mt-w-hold", "-x", PANE_COLUMNS, "-y", PANE_ROWS, "ping -n 600 127.0.0.1"]);
  if (!started.ok) return null;
  const measured = await Promise.all(PSMUX_SAMPLES.map((sample, index) => psmuxSampleWidth(tmux, sample, index)));
  const table = psmuxTableIfMatching(measured);
  if (!table) log(`[tmux] widths: psmux drew the samples as ${JSON.stringify(measured)}, not as unicode-width ${PSMUX_UNICODE_WIDTH_VERSION} predicts`);
  return table ? { table, version: await serverVersion(tmux) } : null;
}
