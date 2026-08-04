// Reading a JSONL transcript without holding it in one string.
//
// A transcript on a working machine reaches 585 MB, and `fs.readFile(file, "utf8")` throws
// "Cannot create a string longer than 0x1fffffe8 characters" past ~512 MB — regardless of what
// the file contains. Every reader that took the whole file caught that and reported "nothing",
// so the longest-running sessions read as the emptiest ones (#998).
//
// Three shapes cover what the callers actually need. Two are not new: this module is where the
// line stream from decision-scan.ts and the tail reader from codex-rollout.ts now live together,
// so a reader picks one instead of writing a third. The third is the byte-range fold a reader uses
// when it will come BACK to the same growing file — reading it whole every time is cheap enough to
// miss until fifty of them are read on every request (#1377).
import { createReadStream, closeSync, openSync, readSync, statSync } from "node:fs";
import readline from "node:readline";
import { isRecord } from "../../common/isRecord.js";

// How much of the end to read. 256 KB was the codex rollout's window and is nowhere near enough
// for a Claude transcript: one record holds a whole tool_result, so on the 585 MB file here the
// last 256 KB is NINE records — not one complete turn. Measured across the six largest transcripts
// on this machine, 4 MB yields 110-1000 records, which covers a turn with room to spare.
const DEFAULT_TAIL_BYTES = 4 * 1024 * 1024;

/** Every line, in order, without ever materialising the file. `onLine` is called with each line
 *  as it arrives, so the caller decides what to keep — which is the point: a summary keeps a
 *  handful of fields out of hundreds of megabytes. */
export async function forEachJsonlLine(file: string, onLine: (line: string) => void): Promise<void> {
  const input = createReadStream(file, "utf8");
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) onLine(line);
  } finally {
    lines.close();
    input.destroy();
  }
}

/** Every record in a JSONL file, one at a time — the whole-file counterpart to readTailRecords.
 *  Nothing is kept: `onRecord` decides what survives, which is how a summary distils hundreds of
 *  megabytes into a handful of fields. Malformed and non-object lines are skipped. */
export async function forEachJsonlRecord(file: string, onRecord: (record: Record<string, unknown>) => void): Promise<void> {
  await forEachJsonlLine(file, (line) => {
    if (!line.trim()) return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) onRecord(parsed);
    } catch {
      // Skip malformed lines, exactly as parseJsonl does.
    }
  });
}

/** Where a scan may start and stop, in BYTES. `to` omitted means EOF.
 *
 *  `atLineStart` is the difference between the two things a byte offset can mean. A resumed scan
 *  continues from an offset a previous scan returned, so the byte IS the start of a line and its
 *  record must be folded. A window picked by arithmetic (the last N bytes) almost always lands
 *  inside a line, and half a line is not JSON — that one is dropped, as readTailLines does. */
export interface JsonlRange {
  from?: number;
  to?: number;
  atLineStart?: boolean;
}

/** Fold the COMPLETE records inside a byte range, and answer where the scan stopped: the end of the
 *  last complete line. A file that is only ever appended to can be re-scanned from that offset and
 *  the two folds are the same fold — which is what lets a reader keep a derived value up to date
 *  without paying for the whole file again (#1377).
 *
 *  A trailing partial line — the writer caught mid-append — is NOT folded and NOT counted, so it is
 *  picked up whole by the next scan rather than parsed as broken JSON. */
export async function forEachJsonlRecordIn(file: string, range: JsonlRange, onRecord: (record: Record<string, unknown>) => void): Promise<number> {
  const from = range.from ?? 0;
  let offset = from;
  let dropLeading = from > 0 && !(range.atLineStart ?? from === 0);
  await forEachCompleteLine(file, range, (line, bytes) => {
    offset += bytes;
    if (dropLeading) {
      dropLeading = false;
      return;
    }
    if (!line.trim()) return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) onRecord(parsed);
    } catch {
      // Skip malformed lines, exactly as forEachJsonlRecord does.
    }
  });
  return offset;
}

// Split on the newline BYTE rather than decoding the range first: 0x0a cannot appear inside a
// multi-byte UTF-8 sequence, so each complete line decodes on its own and the byte count handed to
// the caller is the file's own, not a character count that would drift from it.
async function forEachCompleteLine(file: string, range: JsonlRange, onLine: (line: string, bytes: number) => void): Promise<void> {
  const from = range.from ?? 0;
  if (range.to !== undefined && range.to <= from) return; // an empty range reads nothing
  const stream = createReadStream(file, { start: from, ...(range.to === undefined ? {} : { end: range.to - 1 }) });
  // Held across chunks, because a line is split wherever the chunk boundary happens to fall.
  // Copied rather than kept as a view: a subarray pins the whole chunk it came from.
  let carry: Buffer = Buffer.alloc(0);
  try {
    for await (const chunk of stream) {
      const buf: Buffer = carry.length ? Buffer.concat([carry, asBuffer(chunk)]) : asBuffer(chunk);
      let start = 0;
      for (let nl = buf.indexOf(NEWLINE, start); nl !== -1; nl = buf.indexOf(NEWLINE, start)) {
        onLine(buf.subarray(start, nl).toString("utf8"), nl - start + 1);
        start = nl + 1;
      }
      carry = start === 0 ? buf : Buffer.from(buf.subarray(start));
    }
  } finally {
    stream.destroy();
  }
}

const NEWLINE = 0x0a;

// A read stream types its chunks as `any`, and this reader's byte accounting is only honest if they
// really are bytes: no encoding is set, so every chunk IS a Buffer, and anything else is a bug
// worth hearing about rather than silently coercing.
function asBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") return Buffer.from(chunk);
  throw new TypeError(`jsonl read: expected a Buffer chunk, got ${typeof chunk}`);
}

/** The parsed records at the END of a JSONL file — what every "what happened last" reader wants.
 *  Bounded: it reads `tailBytes`, so a 585 MB transcript costs the same as a 1 KB one. Malformed
 *  lines are skipped, which also covers the partial line a mid-file read can leave behind. */
export function readTailRecords(file: string, tailBytes?: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of readTailLines(file, tailBytes)) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) out.push(parsed);
    } catch {
      // Not JSON — a half line from the read boundary, or a corrupt one. Either way, skip it.
    }
  }
  return out;
}

/** The last lines of a file. The first is dropped when the read started mid-file: that boundary
 *  almost always lands inside a line, and half a line is not JSON. Synchronous and bounded — it
 *  reads `tailBytes`, not the file. Returns [] for anything it cannot read, since every caller
 *  wants "no recent turn" rather than an exception. */
export function readTailLines(file: string, tailBytes: number = DEFAULT_TAIL_BYTES): string[] {
  let fd: number | null = null;
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - tailBytes);
    const length = size - start;
    if (length <= 0) return [];
    const buffer = Buffer.alloc(length);
    fd = openSync(file, "r");
    readSync(fd, buffer, 0, length, start);
    const lines = buffer.toString("utf8").split("\n");
    return start > 0 ? lines.slice(1) : lines;
  } catch {
    return [];
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
