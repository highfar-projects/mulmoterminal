// A live headless terminal that mirrors a non-tmux session's real screen, fed every byte the
// PTY emits for as long as the session runs.
//
// A tmux session can ask the real pane for a full repaint on reattach (#1073,
// plans/fix-1073-redraw-after-reattach.md) because tmux keeps the screen's true state around
// independent of what got replayed. A session with no tmux (persistent PTYs on a platform
// where tmux is unavailable — Windows has no tmux at all) has nothing else holding that state:
// PtyEntry.buffer is a BOUNDED tail (terminal-replay.ts), so a byte a TUI painted before the
// tail's window opened is gone for good, however it's replayed. This mirror is what tmux's
// pane is for the tmux path: fed from spawn, never bounded, so serialize() always has the
// whole screen to give back rather than whatever fits in a fixed-size window.
//
// Imported as a DEFAULT, not `import { Terminal }` — see headlessScreen.ts for why (the CJS/ESM
// interop `@xterm/headless` needs under `node --import tsx`). `@xterm/addon-serialize` does not
// share that problem (its named export survives Node's CJS interop), so it's imported normally.
import headless from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

const { Terminal } = headless;

// RIS (Reset to Initial State): wipes whatever a stale bounded-tail replay drew — scrollback,
// colors, cursor, and a stuck alternate-buffer switch — before the serialized screen redraws
// it correctly. Without this, serialize()'s own buffer-switch sequence lands on top of leftover
// content instead of a clean slate.
const RESET_TO_INITIAL_STATE = "\x1bc";

export interface HeadlessMirror {
  /** Feed one chunk of the PTY's own output, in order. Fire-and-forget: nothing needs to read
   *  the mirror's state until serialize() is called, and that awaits the write queue itself. */
  feed(data: string): void;
  /** Keep the mirror's geometry in step with the real pty's, so a later serialize() reflects
   *  the size the browser actually settled at rather than whatever the pty started at. */
  resize(cols: number, rows: number): void;
  /** The mirror's current screen, as a byte string that reconstructs it exactly when written to
   *  a freshly reset terminal — content, colors, cursor position, and which buffer is active. */
  serialize(): Promise<string>;
  dispose(): void;
}

// scrollback: 0 — this mirror only ever needs to answer "what does the visible screen look
// like right now", the same question tmux's refresh-client answers for its pane. History
// above the fold is still covered, imperfectly, by the existing bounded-tail replay.
export function createHeadlessMirror(cols: number, rows: number): HeadlessMirror {
  const term = new Terminal({ cols, rows, scrollback: 0, allowProposedApi: true });
  const serializeAddon = new SerializeAddon();
  term.loadAddon(serializeAddon);

  return {
    feed(data) {
      term.write(data);
    },
    resize(newCols, newRows) {
      term.resize(newCols, newRows);
    },
    // term.write() queues and parses ASYNCHRONOUSLY — reading state (or, here, another queued
    // write's callback) before a prior write's callback has fired can observe it half-applied
    // (see headlessScreen.ts). An empty write queued behind every feed() so far only calls back
    // once all of them have actually been consumed, which is what makes this safe to await.
    async serialize() {
      await new Promise<void>((resolve) => term.write("", resolve));
      return RESET_TO_INITIAL_STATE + serializeAddon.serialize();
    },
    dispose() {
      term.dispose();
    },
  };
}
