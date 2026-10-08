// A live-looking claude PtyEntry for specs that only need ONE to exist in `ptys`, typed in full so
// no spec has to cast a partial one.
import type { IDisposable, IPty } from "node-pty";
import type { PtyEntry } from "../../server/session/types";

const disposable: IDisposable = { dispose: () => {} };

export const fakePty = (): IPty => ({
  pid: 1,
  cols: 80,
  rows: 24,
  process: "claude",
  handleFlowControl: false,
  onData: () => disposable,
  onExit: () => disposable,
  resize: () => {},
  clear: () => {},
  write: () => {},
  kill: () => {},
  pause: () => {},
  resume: () => {},
});

export const fakePtyEntry = (over: Partial<PtyEntry> = {}): PtyEntry => ({
  term: fakePty(),
  ws: null,
  buffer: "",
  cwd: process.cwd(),
  tmux: true,
  active: false,
  agent: "claude",
  ...over,
});
