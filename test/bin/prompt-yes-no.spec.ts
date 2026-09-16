// @vitest-environment node
// A startup question has THREE endings, and the missing one is the bug (#2090). The launcher
// waited forever for an answer nobody could give: on Windows a wrapper that redirects stdout and
// stderr but leaves stdin alone gets a console `isTTY` calls real and no human can type into.
//
// Both directions on purpose: a real yes and a real no must still mean what they meant, or this
// change trades a hang for a launcher that ignores its user.
import { describe, it, expect, vi } from "vitest";
import { PassThrough } from "node:stream";
import { ANSWER_DEADLINE_MS, askYesNo } from "../../bin/prompt-yes-no.js";

// A question asked over streams nobody is watching, with the deadline under the test's control
// rather than the clock's. `fire` is the only way the deadline can pass, so a test that does not
// call it proves the deadline is not what produced the outcome.
const ask = (question = "go? [y/N] ") => {
  const input = new PassThrough();
  const output = new PassThrough();
  // A listener rather than resume(): it both drains the prompt and keeps it, and attaching it
  // here is the only moment before askYesNo writes.
  const written: string[] = [];
  output.on("data", (chunk: Buffer) => written.push(chunk.toString()));
  let fire: (() => void) | null = null;
  const outcome = askYesNo(question, {
    input,
    output,
    setTimer: (onDeadline: () => void) => {
      fire = onDeadline;
      return "timer";
    },
    clearTimer: vi.fn(),
  });
  return { input, output, outcome, written: () => written.join(""), passDeadline: () => fire?.() };
};

describe("askYesNo — an answer", () => {
  it.each([
    { typed: "y\n", expected: "yes", when: "the user says so" },
    { typed: "\n", expected: "no", when: "a bare Enter arrives, because the prompt says [y/N]" },
    { typed: "maybe\n", expected: "no", when: "the line is unrecognised, rather than a second way to say yes" },
  ])("is $expected when $when", async ({ typed, expected }) => {
    const { input, outcome } = ask();
    input.write(typed);
    await expect(outcome).resolves.toBe(expected);
  });

  it("puts the question to the output, so a log shows what was asked", async () => {
    const { input, outcome, written } = ask("start another? [y/N] ");
    input.write("y\n");
    await outcome;
    expect(written()).toContain("start another? [y/N] ");
  });
});

describe("askYesNo — no answer", () => {
  it("ends as unanswered once the deadline passes, which is the hang (#2090)", async () => {
    const { outcome, passDeadline } = ask();
    passDeadline();
    await expect(outcome).resolves.toBe("unanswered");
  });

  it("ends as unanswered when stdin reaches EOF, WITHOUT the deadline", async () => {
    // readline drops the question callback when the stream ends, so this promise used to stay
    // pending: the launcher ran out of event loop and exited 0 having started nothing and said
    // nothing. Nobody calls passDeadline here — the outcome has to come from the close alone.
    const { input, outcome } = ask();
    input.end();
    await expect(outcome).resolves.toBe("unanswered");
  });

  it("keeps the first ending when the deadline passes after an answer", async () => {
    const { input, outcome, passDeadline } = ask();
    input.write("y\n");
    await expect(outcome).resolves.toBe("yes");
    passDeadline(); // a timer that was not cleared must not be able to change a settled answer
    await expect(outcome).resolves.toBe("yes");
  });

  it("clears the deadline once an answer arrives, so nothing holds the process", async () => {
    const clearTimer = vi.fn();
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const outcome = askYesNo("go? [y/N] ", { input, output, setTimer: () => "timer", clearTimer });
    input.write("n\n");
    await expect(outcome).resolves.toBe("no");
    expect(clearTimer).toHaveBeenCalledWith("timer");
  });
});

describe("ANSWER_DEADLINE_MS", () => {
  // Not the value — that is a judgement call and belongs in the source. The two properties a
  // caller depends on: it is a real duration, and it is long enough that a person reading the
  // four lines above the prompt is not answered for.
  it("is a duration a person could answer within", () => {
    expect(Number.isFinite(ANSWER_DEADLINE_MS)).toBe(true);
    expect(ANSWER_DEADLINE_MS).toBeGreaterThanOrEqual(30_000);
  });
});
