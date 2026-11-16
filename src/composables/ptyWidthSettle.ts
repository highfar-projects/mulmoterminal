// When a fit's new size may go to the pty at once, and when it has to wait for the width to settle.
//
// Every width change the pty sees costs a Claude cell one more copy of its screen in the tmux
// history: Claude Code repaints the whole frame on SIGWINCH without clearing scrollback, and a
// narrower width reflows the old frame upwards first (#2943, anthropics/claude-code#46834). The
// browser fits on every ResizeObserver delivery, so dragging the window edge used to hand the pty
// every intermediate width — one copy each — on the way to the one the user stopped at.
//
// So only a WIDTH change waits, and it waits for the last one (a trailing debounce). Everything
// else still goes at once, for two reasons:
// - a height-only change adds no copy (measured in #2943), and holding it back would leave the
//   agent drawing rows the cell does not have;
// - re-sending the size the pty already has is how a stuck tmux window gets repaired
//   (tmux-size-sync.ts on the server probes after each resize frame), so it must not be swallowed.
//
// Going back to the width already sent while one is pending cancels it: a drag that ends where it
// started costs the pty nothing at all.
//
// xterm itself is fitted immediately either way; only the frame on the wire waits.

// Long enough to cover the gaps between ResizeObserver deliveries during a drag (one per frame),
// short enough that output arriving in the gap — still wrapped at the old width — is rarely seen.
export const PTY_WIDTH_SETTLE_MS = 150;

export type WidthSettleStep =
  /** Send the current size now, and drop any pending send. */
  | { kind: "send-now" }
  /** (Re)start the settle timer; when it fires, send whatever size the terminal has then. */
  | { kind: "wait" };

/**
 * @param lastSentCols the width the pty was last told, or null when this socket has sent nothing
 *   yet (then there is nothing to protect, and the size goes at once).
 */
export function widthSettleStep(lastSentCols: number | null, cols: number): WidthSettleStep {
  if (lastSentCols === null || lastSentCols === cols) return { kind: "send-now" };
  return { kind: "wait" };
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface PtySizeSender {
  /** After a fit: send the size now, or once a new width has settled. */
  sync(): void;
  /** Send the size now, dropping any pending send — a fresh socket's first frame. */
  sendNow(): void;
  /** Drop any pending send and forget what was sent: the socket it was meant for is gone. */
  reset(): void;
}

/**
 * @param send puts one resize frame on the socket; returns false when there is no open socket.
 * @param size the terminal's size, read at send time — so a settle timer that fires sends where
 *   the drag ENDED, not where it was when the timer started.
 */
export function createPtySizeSender(send: (size: TerminalSize) => boolean, size: () => TerminalSize, settleMs = PTY_WIDTH_SETTLE_MS): PtySizeSender {
  let lastSentCols: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const sendNow = (): void => {
    cancel();
    const now = size();
    if (send(now)) lastSentCols = now.cols;
  };
  return {
    sync() {
      if (widthSettleStep(lastSentCols, size().cols).kind === "send-now") {
        sendNow();
        return;
      }
      cancel();
      timer = setTimeout(sendNow, settleMs);
    },
    sendNow,
    reset() {
      cancel();
      lastSentCols = null;
    },
  };
}
