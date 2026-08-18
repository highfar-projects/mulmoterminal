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
 * whose answer is already there does not wait at all. The message names what never happened —
 * better for the next reader than `expected undefined to be defined`.
 */
export const until = async (done: () => boolean | Promise<boolean>, what: string): Promise<void> => {
  for (let i = 0; i <= HOPS_MAX; i++) {
    if (await done()) return;
    await hop();
  }
  throw new Error(`${what} never happened, over ${HOPS_MAX} turns of the event loop`);
};
