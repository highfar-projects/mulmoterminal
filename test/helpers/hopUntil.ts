// Waiting for a thing to happen, in a jsdom spec, without guessing how many turns it takes.
//
// A `MessagePort` delivery is a macrotask, so a microtask flush alone never sees it and specs
// reach for `setTimeout(0)` + `flushPromises()`. What made that a defect rather than a helper was
// the COUNT: measured on `SharedAppPreview.spec.ts`, the answer needs exactly one hop and the
// helper provided exactly one. A margin of zero is why that file failed on Windows CI on two
// separate branches while every other test in it passed (#1796) — one more `await` anywhere in
// the chain under test, or a runner that schedules the delivery a turn later, and the assertion
// reads a list the answer has not reached yet.
//
// Hops rather than milliseconds, deliberately: the number of turns does not change with how fast
// the machine is, so a hop budget stays meaningful where a stopwatch does not.
import { flushPromises } from "@vue/test-utils";

/** One turn of the loop the message travels on. */
export const hop = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
};

// Reaching this is a failure however long it took, so it is set for a loaded runner rather than
// for this machine.
const HOPS_MAX = 200;

/**
 * Hop until `done` holds.
 *
 * The happy path costs what a single hop cost: `done` is checked BEFORE the first one, so a test
 * whose answer is already there does not wait at all.
 *
 * `what` is a NOUN PHRASE for the thing being waited on — "the page's state", "a Send it button" —
 * because the sentence around it is written here. A clause that already says "never" reads as a
 * double negative once this wraps it.
 */
export const until = async (done: () => boolean | Promise<boolean>, what: string): Promise<void> => {
  // Checked once before any hop, then once after each — so the loop spends EXACTLY `HOPS_MAX`
  // hops, which is what the message below claims (CodeRabbit on #1798: `i <= HOPS_MAX` spent 201,
  // one of them after the last check could change nothing).
  if (await done()) return;
  for (let hops = 0; hops < HOPS_MAX; hops++) {
    await hop();
    if (await done()) return;
  }
  throw new Error(`waited ${HOPS_MAX} turns of the event loop for ${what}, and it never came`);
};
