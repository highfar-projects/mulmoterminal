// One bounded `fetch` for the whole UI (#1393).
//
// A request without a deadline does not fail — it does NOTHING, forever, and the screen cannot
// tell that apart from "there was nothing to show". Ten files had worked this out separately and
// written the same AbortController + setTimeout by hand; this is that, once.
//
// The default is 8s because that is what the majority of those ten already chose for a plain API
// read. It is a default rather than a rule: the same ten also run 90s for an LLM summary and 300s
// for an upload, and a blanket value would break exactly those. Pass `timeout_ms` when the call is
// not an ordinary one, and say in a comment why the number is what it is.

/** The deadline for an ordinary `/api` call — read a config, list a directory, save a setting. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

/**
 * For a route that shells out — `git worktree add`, a `gh` call, transcribing audio, spawning an
 * agent. The work is real and its length depends on the repository, the network or the machine,
 * so the default would abort a request that was going to succeed.
 *
 * Still bounded: an hour of nothing is not a better answer than a minute of nothing.
 */
export const SLOW_COMMAND_TIMEOUT_MS = 60_000;

/**
 * `fetch`, but it gives up.
 *
 * A `signal` the caller passes in its `init` is kept: it is how a composable cancels on unmount,
 * and dropping it would leave the request running after the component that wanted it is gone. The
 * two are composed, so whichever fires first wins.
 */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeout_ms: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout_ms);
  const caller = init?.signal;
  const signal = caller ? AbortSignal.any([caller, abort.signal]) : abort.signal;
  try {
    return await fetch(input, { ...init, signal });
  } finally {
    // In `finally` rather than after the await: a rejected request leaves the timer pending
    // otherwise, and a long one would abort a controller nobody is listening to any more.
    clearTimeout(timer);
  }
}
