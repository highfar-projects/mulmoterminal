# `bar(0, max)` drew a block — #1656

## What was wrong

`scripts/lint-summary.mjs`:

```js
function bar(count, max) {
  if (max === 0) return "";
  const filled = Math.max(1, Math.round((count / max) * BAR_WIDTH));
  return "█".repeat(filled);
}
```

`Math.max(1, …)` is there so a rule with one finding still draws something beside a rule with five
hundred, which rounds to nothing. Applied to a count of **zero** it invents a block, and that row
then reads as the smallest non-empty row in the table rather than as empty.

```
bar(0, 5)   = "█"     <- one block for zero findings
bar(1, 500) = "█"     <- the case max(1, …) exists for
```

## Latent, not live

Nothing reaches it today. Every value arriving at `bar()` comes from `byRule`, `byArea` or
`byDirectory`, and the only writer to any of them is `tally()`, which stores `(prev ?? 0) + 1` —
so every stored count is at least 1.

It becomes live the first time a bar is drawn from a value that can legitimately be zero: a
per-area cell rather than the row total, a delta column against a previous run, or a row held at
zero on purpose to show a rule that used to have findings.

## Fix

Catch zero before the `max(1, …)` floor:

```js
export function bar(count, max) {
  if (count === 0 || max === 0) return "";
  return "█".repeat(Math.max(1, Math.round((count / max) * BAR_WIDTH)));
}
```

## Why `bar` is now exported

It has to be, to be testable. `renderReport` cannot pass it a zero — that is the whole point of the
section above — so a test driven through the report can never exercise the guard, and the guard
exists precisely for a caller that does not exist yet. Exporting it is what lets the fix be pinned
rather than asserted. `scripts/lint-summary.d.mts` gains the matching declaration.

## Verified

Old `bar` copied verbatim into a throwaway harness and run beside the new one over every
`count` in 0..600 against `max` in {0, 1, 2, 3, 7, 24, 25, 100, 499, 500, 601}, skipping
`count > max` (a count is only ever ranked against a max it is part of):

```
identical: 2362
differing: 10
```

All ten differ at `count === 0` and nowhere else — old drew 1 block, new draws 0. So inlining
`filled` changed nothing, and the report's real output is byte-for-byte what it was.

`yarn format` / `lint` / `typecheck` / `test` all green; `yarn lint:summary` run against a real
eslint run for the report itself.
