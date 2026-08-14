import { ptys } from "./registry.js";
import { scanForUserInput } from "../../common/terminalReplies.js";

// Write a chunk to a session's live PTY: the phone's typing (#445), and question answers (#1685).
// Only sessions attached in THIS process are writable: a tmux session that outlived a restart is
// still viewable through capture-pane, but we hold no pty to type into.
//
// Its own module rather than a helper in index.ts, because it now has two callers that reach it
// from different directions — the RemoteHost handlers and an /api route — and index.ts is the file
// this repo keeps splitting apart (#548).
const write = (sessionId: string, chunk: string): boolean => {
  const entry = ptys.get(sessionId);
  if (!entry) return false;
  try {
    entry.term.write(chunk);
    return true;
  } catch {
    // pty died between the lookup and the write
    return false;
  }
};

// How many times something OTHER than an in-flight answer has typed into this session.
//
// Answering a question takes ~300ms of paced keystrokes (#1685), and the person at the keyboard can
// answer or cancel that same dialog inside one of those pauses. The remaining Down/Enter would then
// reach the prompt underneath and walk its history. No snapshot of the dialog can see that coming:
// the tool-call close arrives asynchronously, well after the screen changed.
//
// So every ordinary writer announces itself, and the count runs from the moment the DIALOG appeared
// — not from when an answer request arrives. Anything typed in between is exactly what makes the
// dialog no longer the one our keystrokes were computed for, whether it answered it, cancelled it,
// or merely moved its cursor; and a count that started at the request could not see it.
//
// A counter rather than a lock, because an answer must not BLOCK the user's own typing — it is the
// answer that yields.
//
// One entry per session with a live question, reset when the next one opens and dropped when the
// session is reaped.
const watched = new Map<string, number>();

/** Start (or restart) counting for this session's newly opened dialog. */
export const watchOtherWrites = (sessionId: string): void => {
  watched.set(sessionId, 0);
};

/** Stop counting, and forget the session. */
export const stopWatchingOtherWrites = (sessionId: string): void => {
  watched.delete(sessionId);
  partialReply.delete(sessionId);
};

export const otherWriteCount = (sessionId: string): number => watched.get(sessionId) ?? 0;

/** Say that something other than an answer has typed here — for a writer that holds its own pty.
 *  The browser's keystroke path does its own write (it already has the entry, and going through a
 *  registry lookup on every keypress would drop input in any window where the two disagree).
 *  A no-op unless an answer is listening, which is the ordinary case. */
export const noteOtherWrite = (sessionId: string): void => {
  const seen = watched.get(sessionId);
  if (seen !== undefined) watched.set(sessionId, seen + 1);
};

// The tail of a reply that arrived split across frames, per session. The socket breaks where it
// likes, and half of `ESC[?1;2c` matches nothing — judged on its own, each half would read as the
// user typing, which is the false alarm this whole path exists to avoid (#1693).
const partialReply = new Map<string, string>();

/** Classify one chunk of terminal input and count it if the user produced it. */
export const noteInput = (sessionId: string, data: string): void => {
  const { fromUser, pending } = scanForUserInput(partialReply.get(sessionId) ?? "", data);
  if (pending) partialReply.set(sessionId, pending);
  else partialReply.delete(sessionId);
  if (fromUser) noteOtherWrite(sessionId);
};

/** Write on behalf of anything but an answer: the phone's typing, and anything added later. */
export const writeToSession = (sessionId: string, chunk: string): boolean => {
  noteOtherWrite(sessionId);
  return write(sessionId, chunk);
};

/** The keystrokes an answer types. Deliberately NOT counted — it must not interrupt itself. */
export const writeAnswerKey = (sessionId: string, chunk: string): boolean => write(sessionId, chunk);
