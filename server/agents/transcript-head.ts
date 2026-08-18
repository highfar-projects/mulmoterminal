// Reading a title out of the front of an agent's own JSONL transcript.
//
// codex rollouts and agy conversations record different things in different shapes, but the
// listing job is the same one twice: read a bounded head (never the whole file — an agent appends
// to these without limit), pick the first line that is a user turn, and turn it into a row title.
import { open } from "node:fs/promises";
import { isRecord } from "../../common/isRecord.js";

const TITLE_MAX = 60;

/** One JSONL line as a record, or null for a truncated final line or a non-JSON row. */
export function parseJsonRecord(line: string): Record<string, unknown> | null {
  if (!line) return null;
  try {
    const doc: unknown = JSON.parse(line);
    return isRecord(doc) ? doc : null;
  } catch {
    return null;
  }
}

/** A prompt as a single-line row title, or `fallback` when there is nothing to show. */
export function cleanTitle(raw: string | null, fallback: string): string {
  const title = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return title || fallback;
}

/**
 * The first `headBytes` of a transcript plus its mtime, or null if it cannot be read.
 *
 * Both callers want the mtime from the SAME open handle as the head: a file the agent is still
 * appending to can be renamed or removed between a read and a separate stat.
 */
/**
 * The transcript's FIRST line, or null if it cannot be read.
 *
 * Separate from `readTranscriptHead` because the two answer different questions at very different
 * prices. A codex rollout records everything it needs to be ROUTED (its id and cwd) on line 1, but
 * the first thing worth SHOWING sits past 64KB of preamble — so a listing that reads one window
 * for both either pays the large read on every file on disk, or silently gives up on the title.
 *
 * `probeBytes` is a guess at the line length, not a limit: when no newline is found the read grows
 * to `maxBytes` before giving up, so a longer-than-expected first line yields a longer line rather
 * than nothing. Returns null only when the file is unreadable or has no newline within `maxBytes`.
 */
export async function readFirstLine(file: string, probeBytes: number, maxBytes: number): Promise<string | null> {
  for (const size of probeBytes < maxBytes ? [probeBytes, maxBytes] : [maxBytes]) {
    const read = await readTranscriptHead(file, size);
    if (!read) return null;
    const end = read.head.indexOf("\n");
    if (end >= 0) return read.head.slice(0, end);
    if (read.head.length < size) return read.head || null; // whole file, no trailing newline
  }
  return null;
}

export async function readTranscriptHead(file: string, headBytes: number): Promise<{ head: string; mtime: number } | null> {
  let fh;
  try {
    fh = await open(file, "r");
    const buf = Buffer.alloc(headBytes);
    const { bytesRead } = await fh.read(buf, 0, headBytes, 0);
    const { mtimeMs } = await fh.stat();
    return { head: buf.subarray(0, bytesRead).toString("utf8"), mtime: mtimeMs };
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}
