// Fork-only: a record of what the server did to its psmux sessions, one JSON line per event in
// ~/.mulmoterminal/tmux-trace.jsonl.
//
// Why it exists: after a Ctrl+C restart, three of five Claude cells had been ended and started
// again with `--resume` (the "Interrupted" a user saw), while the other two kept running. psmux
// reattached a surviving session correctly in every isolated run, and nothing on screen or on disk
// said which part of the server ended the three. This says it: every `kill-session` with the code
// path that asked for it, every client exit with the `has-session` answer it was judged on, every
// client spawn with whether it meant to reattach, and the moment a shutdown began.
//
// psmux only, so a host on real tmux writes nothing new. Bounded: past MAX_BYTES the file is moved
// to `.1` and started again, so it can be left on.
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_BYTES = 1024 * 1024;

export const tmuxTraceFile = (home: string = os.homedir()): string => path.join(home, ".mulmoterminal", "tmux-trace.jsonl");

/** The frames of the code that called the traced function, without this module's own, Node's
 *  internals or the frame of the traced function itself — enough to name the path that asked. */
export function callerFrames(stack: string | undefined, skip = 1, keep = 6): string[] {
  return (stack ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().replace(/^at /, ""))
    .filter((line) => line !== "" && !line.includes("tmux-trace") && !line.startsWith("node:") && !line.includes("(node:"))
    .slice(skip, skip + keep);
}

/** One event as the line written for it. Pure, so a spec can pin the shape. */
export function traceLine(event: string, fields: Readonly<Record<string, unknown>>, now: Date = new Date(), pid: number = process.pid): string {
  return `${JSON.stringify({ t: now.toISOString(), pid, event, ...fields })}\n`;
}

/** Append one event. Diagnostics: a full or read-only disk costs nothing and throws nothing. */
export function traceTmux(enabled: boolean, event: string, fields: Readonly<Record<string, unknown>>, file: string = tmuxTraceFile()): void {
  if (!enabled) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
    } catch {
      // no file yet
    }
    appendFileSync(file, traceLine(event, fields));
  } catch {
    // diagnostics only
  }
}
