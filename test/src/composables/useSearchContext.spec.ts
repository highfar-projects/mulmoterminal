// The context read's staleness rule, at the composable rather than through the panel (#2159).
//
// Three findings in three review rounds landed on this one rule — the stored answer being
// re-served, an older answer arriving last, and a request outliving the composable. All three are
// "an answer was applied that should not have been", so the rule states what MAY be applied: the
// newest generation, while the composable is still alive. These tests are about that ONE rule, and
// the point of having them here is that the panel cannot observe the third case at all — after
// unmount there is no DOM to read the answer off.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { effectScope, nextTick, ref } from "vue";
import { useSearchContext, type SelectedResult } from "../../../src/composables/useSearchContext";

/** The composable's own debounce, mirrored so the advance can be precise. */
const CONTEXT_DEBOUNCE_MS = 90;

/** Every /lines request, body held open so the test decides when — and whether — it answers. */
let held: { resolve: (body: unknown) => void }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  held = [];
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: () => new Promise((resolve) => held.push({ resolve })),
  })) as unknown as typeof fetch;
});
afterEach(() => vi.useRealTimers());

const windowOf = (text: string) => ({ from: 2, lines: [{ text, clipped: false }] });

/** The composable inside a scope, so `watch` and `computed` have somewhere to live.
 *
 *  It always starts with NO selection, because that is how the panel starts: `selected` is null
 *  while the result list is empty, and a `watch` does not fire for a value it was created with.
 *  Starting with one would schedule no read at all and every assertion below would pass on an
 *  empty request list. */
function mounted() {
  const scope = effectScope();
  const cwd = ref<string | null>("/proj");
  const buffer = ref<{ path: string; text: string } | null>(null);
  const selection = ref<SelectedResult | null>(null);
  const context = scope.run(() => useSearchContext({ cwd, buffer, selected: selection }));
  if (!context) throw new Error("the effect scope did not run");
  const select = async (selected: SelectedResult) => {
    selection.value = selected;
    await nextTick();
  };
  return { scope, cwd, buffer, selection, select, context };
}

const settle = async () => {
  await vi.advanceTimersByTimeAsync(CONTEXT_DEBOUNCE_MS + 1);
  await flushPromises();
};

describe("useSearchContext — only the newest generation may be applied", () => {
  it("applies the answer to the request it is still waiting on", async () => {
    const { select, context } = mounted();
    await select({ path: "a.ts", line: 3 });
    await settle();
    held[0]?.resolve(windowOf("first"));
    await flushPromises();
    expect(context.surrounding.value?.lines[0]?.text).toBe("first");
  });

  // Round 2's finding: the selection leaves and returns, so a key comparison says yes again.
  it("discards an older answer for a row the selection returned to", async () => {
    const { select, context } = mounted();
    await select({ path: "a.ts", line: 3 });
    await settle(); // request 1 for line 3, held
    await select({ path: "a.ts", line: 9 });
    await select({ path: "a.ts", line: 3 });
    await settle(); // request 2 for line 3, held
    expect(held.length).toBeGreaterThanOrEqual(2);

    held[held.length - 1]?.resolve(windowOf("newer"));
    await flushPromises();
    expect(context.surrounding.value?.lines[0]?.text).toBe("newer");

    held[0]?.resolve(windowOf("older"));
    await flushPromises();
    expect(context.surrounding.value?.lines[0]?.text).toBe("newer");
  });

  // The stored answer's key is compared at RENDER time, and that is a second job, not a spare copy
  // of the generation rule. The watch clears the stored answer, but a watch runs on the `pre`
  // flush — so between the selection moving and the watch running, the stored answer is still
  // there while the selection has already changed. Reading in that window is what the comparison
  // is for, and this is the window: no `nextTick` between the move and the read.
  //
  // I had derived that the comparison was dead and was ready to delete it. Codex disputed the
  // derivation — "a key can leave and return without producing a net watcher change" — and this
  // test is what settles it in favour of keeping it.
  it("shows nothing for a selection the stored answer does not describe, before the watch has run", async () => {
    const { select, selection, context } = mounted();
    await select({ path: "a.ts", line: 3 });
    await settle();
    held[0]?.resolve(windowOf("for line 3"));
    await flushPromises();
    expect(context.surrounding.value?.lines[0]?.text).toBe("for line 3");

    // Move, and read WITHOUT awaiting — the watch has not cleared the stored answer yet.
    selection.value = { path: "a.ts", line: 9 };
    expect(context.surrounding.value).toBeNull();
  });

  // Teardown's OTHER path, which is the one I missed when I answered that there were exactly two
  // invalidation events: a caller that never calls `stop` still disposes the scope, and then the
  // watch dies while a request already past its await does not (Codex, round 3 follow-up).
  it("applies nothing once its SCOPE is disposed, even without a stop() call", async () => {
    const { scope, select, context } = mounted();
    await select({ path: "a.ts", line: 3 });
    await settle();
    expect(held).toHaveLength(1); // the premise: a request really is outstanding

    scope.stop(); // and NOT context.stop()
    held[0]?.resolve(windowOf("after scope disposal"));
    await flushPromises();
    expect(context.surrounding.value).toBeNull();
  });

  // Round 3's finding, and the one the panel cannot see: after teardown there is no DOM, so
  // "nothing was rendered" is not evidence that nothing was applied. Read the value instead.
  it("applies nothing once it has been stopped, even if the read answers afterwards", async () => {
    const { scope, select, context } = mounted();
    await select({ path: "a.ts", line: 3 });
    await settle();
    expect(held).toHaveLength(1); // the premise: a request really is outstanding

    context.stop();
    held[0]?.resolve(windowOf("after teardown"));
    await flushPromises();
    expect(context.surrounding.value).toBeNull();
    scope.stop();
  });
});
