# Plugin dispatch: a deadline long enough for a movie, and a timeout that says so (#2908)

## Problem

`makeDispatch` in `src/composables/pluginRuntime.ts` sends every plugin dispatch through
`fetchWithTimeout(..., SLOW_COMMAND_TIMEOUT_MS)` — 60 s. mulmoscript's `generateMovie` (and
`generatePdf`, `renderBeat`, `generateBeatAudio`) answer only when the work is done, so anything
longer is aborted in the browser while the server keeps going. The View shows
"Movie generation failed: signal is aborted without reason" next to the movie that then arrives
over pubsub. Reproduced on main 5c219598d with a `remotion` beat: banner at ~60 s, mp4 written
~20 s later.

MulmoClaude's dispatch (`src/utils/plugin/runtime.ts` → `apiPost`) has no deadline. The 60 s here
came from #1393's sweep that bounded every request; it was not chosen for movie generation.

## Decision: option B (from the issue)

Keep a bound (#1393: a request without one can do nothing forever), but give plugin dispatch its
own, long one, and make a deadline abort read as a timeout rather than as a failure.

- `src/composables/pluginDispatchDeadline.ts` (pure):
  - `PLUGIN_DISPATCH_TIMEOUT_MS` — 60 minutes. A movie may hold several remotion scenes, and
    mulmocast allows each `claude -p` call up to 10 minutes.
  - `pluginDispatchError(toolName, err, timeout_ms)` — an `AbortError` becomes an Error saying no
    answer came within the deadline and that the work may still be running on the server; any
    other error is returned unchanged.
- `pluginRuntime.ts` uses both. The runtime passes no signal of its own, so an abort there can only
  be the deadline.

Deliberate divergence from MulmoClaude: it has no deadline; this host keeps one, longer.

## Tests

- the pure function: AbortError (DOMException and a plain object named AbortError) → message;
  TypeError, a non-2xx Error, null/undefined/string → unchanged.
- the runtime: with fake timers, a fetch that only settles on abort is still pending past the old
  60 s and rejects with the timeout message at the new deadline.

## Verification

Run the app and press Movie on a script that takes longer than 60 s: no banner, the movie appears.
