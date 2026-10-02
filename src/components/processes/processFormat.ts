// How the Processes page prints a row's numbers (#2219).
import { compactRelativeTime } from "../cellDisplay";

const KB_PER_MB = 1024;
const KB_PER_GB = KB_PER_MB * 1024;
// Below this a gigabyte value keeps a decimal: 1.5G reads usefully, 12.3G does not need it.
const GB_DECIMAL_BELOW = 10;
const MS_PER_SECOND = 1000;

/** Resident memory from `ps -o rss` (kilobytes). */
export function formatMemory(rssKb: number): string {
  if (rssKb >= KB_PER_GB) {
    const gb = rssKb / KB_PER_GB;
    return `${gb.toFixed(gb < GB_DECIMAL_BELOW ? 1 : 0)}G`;
  }
  if (rssKb >= KB_PER_MB) return `${Math.round(rssKb / KB_PER_MB)}M`;
  return `${rssKb}K`;
}

/** The same wording the grid uses for "how long ago", as a duration. */
export const formatElapsed = (elapsedSeconds: number, now: number): string => compactRelativeTime(now - elapsedSeconds * MS_PER_SECOND, now);

/** Unknown until the second read, which is the first one with a baseline. */
export const formatCpu = (cpuPercent: number | null): string => (cpuPercent === null ? "—" : `${Math.round(cpuPercent)}%`);
