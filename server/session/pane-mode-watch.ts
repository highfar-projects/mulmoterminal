// Whether a pane is in tmux copy-mode, told to the browser so it can say why typing does nothing.
//
// A pane whose program asks for no mouse reports (a shell, Codex's inline screen) goes into
// copy-mode on a wheel-up or a drag, and from then on every key goes to tmux: under `mode-keys vi`
// hjkl move a cursor and other letters vanish (#2207). tmux announces none of this, so the state
// is ASKED for — and only after input to that pane, because input is the only thing that moves a
// pane in or out of the mode. Idle sessions cost nothing, however many there are.

export interface PaneModeWatchDeps {
  /** tmux's `#{pane_in_mode}` for the session, or null when it cannot say. */
  inModeOf: (id: string) => Promise<boolean | null>;
  /** Hand the new state to whoever is showing this session. */
  publish: (id: string, inCopyMode: boolean) => void;
  settleMs?: number;
}

// Long enough that typing a word costs one probe rather than one per key, short enough that the
// banner is up before the second key of a confused retry.
const DEFAULT_SETTLE_MS = 120;

export function createPaneModeWatch(deps: PaneModeWatchDeps) {
  const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const published = new Map<string, boolean>();
  // A probe is an await long, so a slow answer can land after a newer one. Counted across the
  // process for the reason tmux-size-sync gives: a forgotten id can never reissue a live ticket.
  const newestTicket = new Map<string, number>();
  let issued = 0;

  async function probe(id: string, ticket: number): Promise<void> {
    const inCopyMode = await deps.inModeOf(id);
    if (newestTicket.get(id) !== ticket || inCopyMode === null) return;
    if (published.get(id) === inCopyMode) return;
    published.set(id, inCopyMode);
    deps.publish(id, inCopyMode);
  }

  /** Call after input to the pane; only the last of a burst is probed. */
  function requestCheck(id: string): void {
    clearTimeout(pending.get(id));
    issued += 1;
    const ticket = issued;
    newestTicket.set(id, ticket);
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        // A probe that throws leaves the banner as it was; the next input asks again.
        probe(id, ticket).catch(() => {});
      }, settleMs),
    );
  }

  /** A new socket starts from "not in copy-mode", so whatever the old one was told is void. */
  function requestFreshCheck(id: string): void {
    published.delete(id);
    requestCheck(id);
  }

  /** The session is gone for good. */
  function forget(id: string): void {
    clearTimeout(pending.get(id));
    pending.delete(id);
    published.delete(id);
    newestTicket.delete(id);
  }

  // Exists so "a reap frees the state" is tested rather than asserted — nothing in the app reads it.
  const trackedSessionCount = (): number => newestTicket.size;

  return { requestCheck, requestFreshCheck, forget, trackedSessionCount };
}
