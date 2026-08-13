// Every spec that mounts a component gets its wrappers torn down after each test.
//
// Without this a mounted component OUTLIVES the test that created it: its watchers keep
// running and its pending timers keep ticking on the real clock. The counters specs read
// (fetch mocks, emitted events) are global, so a leftover component's late work is counted
// as the NEXT test's — which is what made the TerminalCell debounce case fail only on a
// loaded runner, where a later test's measurement window stretches far enough to overlap a
// previous test's 300ms debounce (#903).
//
// Global rather than per-file: 18 spec files mounted without ever unmounting, and the next
// one written would have joined them.
//
// Behind the same `window` check as setup-i18n.ts, and for the same reason: setupFiles run for
// EVERY environment, and the 400-odd specs marked `@vitest-environment node` mount nothing — so a
// static import made each of them pull @vue/test-utils' module graph to register a hook that can
// never fire.
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  const { enableAutoUnmount } = await import("@vue/test-utils");
  enableAutoUnmount(afterEach);
}
