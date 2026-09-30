# The headless preview ends a run on a replaced frame; its spec fails when the runner starves (#2588)

## Detached frame (the run-ending failure)

Every mount REPLACES the iframe (`headlessHarness.ts` `render` removes the old one), so a frame handle from
one mount is detached by the next. Two things made that fatal:

- `Driver.frame()` picked the first `about:srcdoc` frame from `page.frames()`. Puppeteer drops a detached
  frame from that list only when the browser's detach event arrives, so on a slow runner the OLD frame could
  still be picked. It now asks the iframe element the harness holds (`contentFrame()`).
- Puppeteer refuses a detached frame by throwing SYNCHRONOUSLY from a decorator, before a promise exists, so
  `x.$$(…).catch(…)` / `x.evaluate(…).catch(…)` did not catch it. The unguarded control survey
  (`frame.$$(CLICKABLE)`) then ended the whole run with "Attempted to use detached Frame" — the exact text
  reported. Every browser question now goes through `browserCall`, which turns a synchronous throw into a
  rejection, and the survey is a guarded `Driver.controls()` whose failure is reported like `evaluate`'s.

`test/server/backends/headlessDriver.spec.ts` holds a frame across a mount on purpose, so the detached case
does not depend on a runner being slow.

## Navigation budget (the environmental one)

Chrome missing the 10s navigation budget twice while node fetched the page (200), with other specs timing out
in the same job, is the runner. The product's limits stay as #2103 sized them; the spec retries a run once
only on that exact failure (`runHeadless`), and any other failure comes back as it came.
