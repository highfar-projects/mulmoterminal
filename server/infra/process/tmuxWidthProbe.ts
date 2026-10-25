// Measures, once at boot, how many columns the tmux on PATH gives each character, and whether it folds
// sequences the way tmuxClusters.ts mirrors (#3173). The browser's xterm then counts with exactly this.
//
// The probe runs its own throwaway tmux server on an ABSOLUTE `-S` socket and kills only that. It
// must never name `-L mulmoterminal`: this process may run inside a cell of the live server, where
// `$TMUX` (removed from the environment below) would also point a bare `tmux` at it.
// `-f /dev/null`: the conf we write sets nothing that changes widths, and it carries hooks a probe
// must not fire.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLUSTER_SAMPLES, rowWidthOf } from "../../../common/tmuxClusters.js";
import { probedCodepoints, widthFormatFor, widthRunsFromAnswers, type TmuxWidthTable, type WidthRun } from "../../../common/tmuxWidthTable.js";
import { sanitizePtyEnv, withFallbackLocale } from "./pty-env.js";
import { spawnCaptureAsync } from "./spawnCapture.js";

// tmux refuses a command line past a fixed length ("command too long"); this many fits with room.
const CODEPOINTS_PER_QUERY = 1000;
// Wide enough that no sample wraps; the pane is never attached, so its size is all it has.
const PANE_COLUMNS = "200";
const PANE_ROWS = "5";
const SAMPLE_POLL_MS = 20;
const SAMPLE_POLL_LIMIT = 100;

type Log = (line: string) => void;

let measuredTable: TmuxWidthTable | null = null;

/** The table measured at boot, or null until it is (and for good when it could not be). */
export const tmuxWidthTable = (): TmuxWidthTable | null => measuredTable;

// The environment a session gets, so the probe counts in the same locale; minus what would make a
// bare tmux client reach a server other than the one named by `-S`.
const TMUX_CLIENT_VARS: ReadonlySet<string> = new Set(["TMUX", "TMUX_PANE"]);

function probeEnv(): NodeJS.ProcessEnv {
  const sessionEnv = withFallbackLocale(sanitizePtyEnv(process.env, path.delimiter), process.platform);
  return Object.fromEntries(Object.entries(sessionEnv).filter(([name]) => !TMUX_CLIENT_VARS.has(name)));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Every byte as an octal escape, so the shell never reads the sample as anything. `env printf` is the
// POSIX one, whatever the default shell's own printf does with escapes.
const octalEscaped = (text: string): string =>
  Array.from(Buffer.from(text, "utf8"))
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("");

interface ThrowawayTmux {
  run(args: string[]): Promise<{ ok: boolean; stdout: string }>;
}

async function measuredRuns(tmux: ThrowawayTmux): Promise<WidthRun[] | null> {
  const codepoints = probedCodepoints();
  const answers: string[] = [];
  for (let start = 0; start < codepoints.length; start += CODEPOINTS_PER_QUERY) {
    const result = await tmux.run(["display-message", "-p", widthFormatFor(codepoints.slice(start, start + CODEPOINTS_PER_QUERY))]);
    if (!result.ok) return null;
    answers.push(...result.stdout.trimEnd().split(","));
  }
  return widthRunsFromAnswers(codepoints, answers);
}

// The sample is printed in the pane, followed by a marker unique to it, and the cursor is read once
// that marker has landed — a respawned pane can still show the previous sample's row.
async function sampleWidth(tmux: ThrowawayTmux, sample: string, index: number): Promise<number | null> {
  const marker = `|${index}|`;
  const printed = await tmux.run(["respawn-pane", "-k", `env printf '${octalEscaped(sample + marker)}'; exec sleep 600`]);
  if (!printed.ok) return null;
  for (let attempt = 0; attempt < SAMPLE_POLL_LIMIT; attempt++) {
    const row = await tmux.run(["capture-pane", "-p", "-S", "0", "-E", "0"]);
    if (row.ok && row.stdout.trimEnd().endsWith(marker)) {
      const cursor = await tmux.run(["display-message", "-p", "#{cursor_x}"]);
      return cursor.ok ? Number(cursor.stdout.trim()) - marker.length : null;
    }
    await sleep(SAMPLE_POLL_MS);
  }
  return null;
}

async function foldsLikeTmux36(tmux: ThrowawayTmux, table: TmuxWidthTable, log: Log): Promise<boolean> {
  const folded = { ...table, clusters: true };
  for (const [index, sample] of CLUSTER_SAMPLES.entries()) {
    const measured = await sampleWidth(tmux, sample, index);
    const predicted = rowWidthOf(folded, sample);
    if (measured !== predicted) {
      log(`[tmux] widths: ${JSON.stringify(sample)} is ${measured} columns here, not ${predicted} — sequences are counted per character`);
      return false;
    }
  }
  return true;
}

async function measureWith(tmux: ThrowawayTmux, log: Log): Promise<TmuxWidthTable | null> {
  const started = await tmux.run(["-f", "/dev/null", "new-session", "-d", "-x", PANE_COLUMNS, "-y", PANE_ROWS, "exec sleep 600"]);
  if (!started.ok) return null;
  const runs = await measuredRuns(tmux);
  if (!runs) return null;
  const option = await tmux.run(["show-options", "-gv", "variation-selector-always-wide"]);
  const perCodepoint: TmuxWidthTable = { runs, clusters: false, vs16Wide: option.ok && option.stdout.trim() === "on" };
  return { ...perCodepoint, clusters: await foldsLikeTmux36(tmux, perCodepoint, log) };
}

/** Measures the tmux on PATH and keeps the result for `tmuxWidthTable()`. Never throws. */
export async function measureTmuxWidths(log: Log): Promise<TmuxWidthTable | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mt-w-"));
  const env = probeEnv();
  const tmux: ThrowawayTmux = {
    run: async (args) => {
      const result = await spawnCaptureAsync("tmux", ["-S", path.join(dir, "s"), ...args], { env });
      return { ok: result.status === 0, stdout: result.stdout };
    },
  };
  try {
    measuredTable = await measureWith(tmux, log);
    if (!measuredTable) log("[tmux] widths: could not be measured — terminals count with Unicode 11");
    return measuredTable;
  } catch (error) {
    log(`[tmux] widths: measuring failed (${error instanceof Error ? error.message : String(error)}) — terminals count with Unicode 11`);
    return null;
  } finally {
    await tmux.run(["kill-server"]);
    await rm(dir, { recursive: true, force: true });
  }
}
