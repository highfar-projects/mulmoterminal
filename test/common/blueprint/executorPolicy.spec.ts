// @vitest-environment node
import { describe, it, expect } from "vitest";
import { basePlanSchema } from "../../../common/blueprint/plan";
import { initialState, type BlueprintState, type StepState } from "../../../common/blueprint/state";
import {
  MAX_FAILED_CHECKS,
  MAX_ROUNDS,
  atRoundLimit,
  nextAction,
  shouldRepeat,
  type ExecutorInputs,
  waitsOnBusyFolder,
} from "../../../common/blueprint/executorPolicy";
import {
  earlierAnswers,
  resolvedCheck,
  stepPrompt,
  CHECK_OUTPUT_PROMPT_CHARS,
  EARLIER_ANSWERS_PROMPT_CHARS,
  EARLIER_FAILURE_PROMPT_CHARS,
} from "../../../common/blueprint/stepPrompt";

const steps = basePlanSchema.parse({
  steps: [
    { id: "a", title: "A", skill: "skills/a", check: "true" },
    { id: "b", title: "B", skill: "skills/b", check: "sh check-b.sh", gates: ["billing"] },
  ],
}).steps;

const passedA: StepState = { status: "passed", approved: false, answers: [], lastCheck: { ok: true, output: "", atMs: 1 } };

const withB = (b: Partial<StepState>): BlueprintState => ({ steps: { a: passedA, b: { status: "pending", approved: false, answers: [], ...b } } });

const inputs = (state: BlueprintState, extra: Partial<ExecutorInputs> = {}): ExecutorInputs => ({
  steps,
  state,
  failedChecks: {},
  sessionActive: false,
  ...extra,
});

describe("nextAction", () => {
  it("starts the first step of a fresh build", () => {
    expect(nextAction(inputs(initialState(steps)))).toEqual({ kind: "start", stepId: "a" });
  });

  it("moves to the next step once the current one passed", () => {
    expect(nextAction(inputs(withB({})))).toEqual({ kind: "start", stepId: "b" });
  });

  it("hands a running step to a new session when none is working on it", () => {
    expect(nextAction(inputs(withB({ status: "running", approved: true })))).toEqual({ kind: "spawn", stepId: "b" });
  });

  it("waits while a session is working", () => {
    expect(nextAction(inputs(withB({ status: "running", approved: true }), { sessionActive: true }))).toEqual({ kind: "wait", stepId: "b", on: "agent" });
  });

  it.each([
    ["awaiting-approval", "approval"],
    ["awaiting-answer", "answer"],
  ] as const)("waits for a person when the step is %s", (status, on) => {
    expect(nextAction(inputs(withB({ status, question: "q" })))).toEqual({ kind: "wait", stepId: "b", on });
  });

  const failedCheck: Partial<StepState> = { status: "failed", approved: true, reason: "check failed", lastCheck: { ok: false, output: "boom", atMs: 2 } };

  it("retries a failed check automatically while attempts remain", () => {
    expect(nextAction(inputs(withB(failedCheck), { failedChecks: { b: MAX_FAILED_CHECKS - 1 } }))).toEqual({ kind: "retry", stepId: "b" });
  });

  it("stops for a person once the automatic attempts are spent", () => {
    expect(nextAction(inputs(withB(failedCheck), { failedChecks: { b: MAX_FAILED_CHECKS } }))).toEqual({ kind: "wait", stepId: "b", on: "failure" });
  });

  it("never retries a rejected gate on its own", () => {
    expect(nextAction(inputs(withB({ status: "failed", reason: "too expensive" })))).toEqual({ kind: "wait", stepId: "b", on: "failure" });
  });

  it("is done when every step passed", () => {
    expect(nextAction(inputs({ steps: { a: passedA, b: { ...passedA } } }))).toEqual({ kind: "done" });
  });
});

describe("stepPrompt", () => {
  const prompt = (stepState: StepState | undefined) =>
    stepPrompt({
      step: steps[1],
      skillFile: "/packs/firebase/skills/b/SKILL.md",
      packDirs: { base: "/packs/firebase", usecase: "/packs/internal" },
      stepState,
      askCommand: "ASK",
    });

  it("points a question for a person at both packs' guides", () => {
    const text = prompt(undefined);
    expect(text).toContain("/packs/firebase/guides");
    expect(text).toContain("/packs/internal/guides");
  });

  it("names the skill, the spec, the way to ask and the check", () => {
    const text = prompt(undefined);
    expect(text).toContain("/packs/firebase/skills/b/SKILL.md");
    expect(text).toContain(".blueprint/spec.md");
    expect(text).toContain("QUESTION='your question' ASK");
    expect(text).toContain("sh check-b.sh");
  });

  it("carries earlier answers so they are not asked again", () => {
    const text = prompt({ status: "running", approved: true, answers: [{ question: "Region?", answer: "Tokyo", atMs: 1 }] });
    expect(text).toContain("Q: Region?");
    expect(text).toContain("A: Tokyo");
  });

  it("carries the tail of a failing check's output, and only the tail", () => {
    const output = `${"x".repeat(CHECK_OUTPUT_PROMPT_CHARS)}THE-END`;
    const text = prompt({ status: "running", approved: true, answers: [], lastCheck: { ok: false, output, atMs: 1 } });
    expect(text).toContain("THE-END");
    expect(text).not.toContain("x".repeat(CHECK_OUTPUT_PROMPT_CHARS + 1));
  });

  it("says nothing about a check that passed", () => {
    expect(prompt({ status: "running", approved: true, answers: [], lastCheck: { ok: true, output: "fine", atMs: 1 } })).not.toContain("did not pass");
  });

  it("points a failed attempt at the check itself, with the pack folders written in, and forbids changing it", () => {
    const failing = stepPrompt({
      step: { ...steps[1], check: 'sh "$BLUEPRINT_USECASE/checks/actions.sh" local' },
      skillFile: "/packs/firebase/skills/b/SKILL.md",
      packDirs: { base: "/packs/firebase", usecase: "/packs/internal" },
      stepState: { status: "running", approved: true, answers: [], lastCheck: { ok: false, output: "missing", atMs: 1 } },
      askCommand: "ASK",
    });
    expect(failing).toContain('read the check to see exactly what it requires — it is `sh "/packs/internal/checks/actions.sh" local`');
    expect(failing).toContain("Never change the check");
    expect(prompt(undefined)).not.toContain("read the check");
  });
});

describe("stepPrompt — earlier failures and repair attempts", () => {
  const failing: StepState = { status: "running", approved: true, answers: [], lastCheck: { ok: false, output: "LAST", atMs: 1 } };
  const prompt = (earlierFailures: readonly string[], stepState: Parameters<typeof stepPrompt>[0]["stepState"] = failing, failedAttempts = 0) =>
    stepPrompt({ step: steps[1], skillFile: "/s", packDirs: { base: "/b", usecase: "/u" }, stepState, askCommand: "ASK", earlierFailures, failedAttempts });

  it("shows no history on a first retry", () => {
    expect(prompt([])).not.toContain("Earlier attempts failed");
  });

  it("shows the earlier failures, oldest first, and calls it a repair only once enough have failed", () => {
    const twice = prompt(["FIRST"]);
    expect(twice).toContain("Earlier attempts failed this check too");
    expect(twice.indexOf("FIRST")).toBeLessThan(twice.indexOf("LAST"));
    expect(twice).not.toContain("This is a repair attempt");
    expect(prompt(["FIRST", "SECOND"])).toContain("This is a repair attempt: 3 attempts in a row");
  });

  it("is a repair by the count alone, for a run recorded before the outputs were kept", () => {
    const legacy = prompt([], failing, 3);
    expect(legacy).toContain("This is a repair attempt: 3 attempts in a row");
    expect(legacy).not.toContain("Earlier attempts failed");
    expect(prompt([], failing, 2)).not.toContain("This is a repair attempt");
  });

  it("keeps only the tail of each earlier failure", () => {
    const text = prompt([`${"y".repeat(EARLIER_FAILURE_PROMPT_CHARS + 10)}END-OF-FIRST`]);
    expect(text).toContain("END-OF-FIRST");
    expect(text).not.toContain("y".repeat(EARLIER_FAILURE_PROMPT_CHARS + 1));
  });

  it("says nothing about failures once the check passed", () => {
    expect(prompt(["FIRST", "SECOND"], { ...failing, lastCheck: { ok: true, output: "", atMs: 2 } })).not.toContain("Earlier attempts failed");
  });
});

describe("resolvedCheck", () => {
  const dirs = { base: "/b", usecase: "/u" };
  it.each([
    ['sh "$BLUEPRINT_USECASE/checks/a.sh" local', 'sh "/u/checks/a.sh" local'],
    ['node "${BLUEPRINT_BASE}/checks/x.mjs" && sh "$BLUEPRINT_USECASE/y.sh"', 'node "/b/checks/x.mjs" && sh "/u/y.sh"'],
    ["sh check-b.sh", "sh check-b.sh"],
    ["echo $BLUEPRINT_OTHER $HOME", "echo $BLUEPRINT_OTHER $HOME"],
  ])("writes the pack folders into %s", (check, resolved) => {
    expect(resolvedCheck(check, dirs)).toBe(resolved);
  });
});

describe("shouldRepeat", () => {
  const [plain] = steps;
  const repeating = { ...plain, repeatWhile: "more" };

  it("repeats a repeating step while there is more work, and not once there is none", () => {
    expect(shouldRepeat(repeating, 0, true)).toBe(true);
    expect(shouldRepeat(repeating, 0, false)).toBe(false);
  });

  it("never repeats a step without repeatWhile, whatever it is told", () => {
    expect(shouldRepeat(plain, 0, true)).toBe(false);
  });

  it("stops at the round limit even when there is more", () => {
    expect(shouldRepeat(repeating, MAX_ROUNDS - 2, true)).toBe(true);
    expect(shouldRepeat(repeating, MAX_ROUNDS - 1, true)).toBe(false);
  });
});

describe("stepPrompt — a repeating step", () => {
  const base = { skillFile: "/p/SKILL.md", packDirs: { base: "/b", usecase: "/u" }, askCommand: "ASK" };

  it("says which round it is and to do one item", () => {
    const text = stepPrompt({
      ...base,
      step: { ...steps[0], repeatWhile: "sh more.sh" },
      stepState: { status: "running", approved: false, answers: [], round: 2 },
    });
    expect(text).toContain("round 3");
    expect(text).toContain("exactly ONE item");
    expect(text).toContain("sh more.sh");
  });

  it("says nothing about rounds for a step that does not repeat", () => {
    expect(stepPrompt({ ...base, step: steps[0], stepState: undefined })).not.toContain("This step repeats");
  });
});

describe("atRoundLimit", () => {
  const repeating = { ...steps[0], repeatWhile: "more" };

  it("is the limit only on the last round, with work left, for a repeating step", () => {
    expect(atRoundLimit(repeating, MAX_ROUNDS - 1, true)).toBe(true);
    expect(atRoundLimit(repeating, MAX_ROUNDS - 2, true)).toBe(false);
    expect(atRoundLimit(repeating, MAX_ROUNDS - 1, false)).toBe(false);
    expect(atRoundLimit(steps[0], MAX_ROUNDS - 1, true)).toBe(false);
  });
});

describe("what the person decided in earlier steps", () => {
  const three = basePlanSchema.parse({
    steps: [
      { id: "survey", title: "Survey", skill: "skills/s", check: "true" },
      { id: "polish", title: "Polish", skill: "skills/p", check: "true" },
      { id: "report", title: "Report", skill: "skills/r", check: "true" },
    ],
  }).steps;
  const answered = (question: string, answer: string): StepState => ({ status: "passed", approved: true, answers: [{ question, answer, atMs: 1 }] });
  const states = { survey: answered("Widen the scope?", "Yes, follow STYLE.md"), polish: answered("Two edits?", "Go ahead") };

  it("gathers the answers given while the steps before this one ran, in plan order, with each step's title", () => {
    expect(earlierAnswers(three, states, "report")).toEqual([
      { step: "Survey", question: "Widen the scope?", answer: "Yes, follow STYLE.md" },
      { step: "Polish", question: "Two edits?", answer: "Go ahead" },
    ]);
    expect(earlierAnswers(three, states, "polish")).toEqual([{ step: "Survey", question: "Widen the scope?", answer: "Yes, follow STYLE.md" }]);
  });

  it("gathers nothing for the first step, a step not in the plan, or steps nobody asked in", () => {
    expect(earlierAnswers(three, states, "survey")).toEqual([]);
    expect(earlierAnswers(three, states, "gone")).toEqual([]);
    expect(earlierAnswers(three, {}, "report")).toEqual([]);
  });

  it("names the round of a repeating step, and gives a step its own finished rounds but not the round now running", () => {
    const repeated: StepState = {
      status: "running",
      approved: true,
      round: 1,
      earlierRounds: [{ round: 1, question: "Contact?", answer: "総務部（内線 201）", atMs: 1 }],
      answers: [{ question: "This part?", answer: "yes", atMs: 2 }],
    };
    expect(earlierAnswers(three, { survey: repeated }, "survey")).toEqual([{ step: "Survey, round 1", question: "Contact?", answer: "総務部（内線 201）" }]);
    expect(earlierAnswers(three, { survey: { ...repeated, status: "passed" } }, "polish")).toEqual([
      { step: "Survey, round 1", question: "Contact?", answer: "総務部（内線 201）" },
      { step: "Survey, round 2", question: "This part?", answer: "yes" },
    ]);
  });

  it("keeps the newest answers when they do not all fit, and says how many older ones were left out", () => {
    const long = "x".repeat(Math.ceil(EARLIER_ANSWERS_PROMPT_CHARS / 3));
    const many = Array.from({ length: 6 }, (_unused, index) => ({ step: "Draft", question: `Q${index}`, answer: long }));
    const text = stepPrompt({
      step: three[2],
      skillFile: "/p/SKILL.md",
      packDirs: { base: "/b", usecase: "/u" },
      stepState: undefined,
      askCommand: "ASK",
      earlierAnswers: many,
    });
    expect(text).toContain("Q5");
    expect(text).not.toContain("Q0");
    expect(text).toMatch(/\((\d+) older answers left out\)/);
    const oneHuge = [{ step: "Draft", question: "Huge", answer: "y".repeat(EARLIER_ANSWERS_PROMPT_CHARS * 2) }];
    expect(
      stepPrompt({
        step: three[2],
        skillFile: "/p/SKILL.md",
        packDirs: { base: "/b", usecase: "/u" },
        stepState: undefined,
        askCommand: "ASK",
        earlierAnswers: oneHuge,
      }),
    ).toContain("Q: Huge");
  });

  it("puts them in the prompt as standing over the interview answers file, and says nothing when there are none", () => {
    const base = { step: three[1], skillFile: "/p/SKILL.md", packDirs: { base: "/b", usecase: "/u" }, stepState: undefined, askCommand: "ASK" };
    const text = stepPrompt({ ...base, earlierAnswers: earlierAnswers(three, states, "polish") });
    expect(text).toContain('In "Survey": Q: Widen the scope?\n  A: Yes, follow STYLE.md');
    expect(text).toContain("it stands over the file");
    expect(stepPrompt(base)).not.toContain("earlier steps");
  });
});

describe("waitsOnBusyFolder", () => {
  const busy: StepState["lastCheck"] = { ok: false, output: "busy", atMs: 1, notice: { code: "folder-busy", runId: "run-1" } };
  const stateWith = (a: Partial<StepState>): BlueprintState => ({ steps: { a: { status: "failed", approved: false, answers: [], ...a } } });
  const passed: StepState = { status: "passed", approved: true, answers: [], lastCheck: { ok: true, output: "", atMs: 1 } };

  it("is the step that stopped because another build was working in the folder", () => {
    expect(waitsOnBusyFolder(steps, stateWith({ lastCheck: busy }))).toBe("a");
  });

  it("is null for any other stop, a step not stopped, or a build with nothing left", () => {
    expect(waitsOnBusyFolder(steps, stateWith({ lastCheck: { ok: false, output: "busy", atMs: 1, notice: { code: "untrusted", dir: "/w" } } }))).toBeNull();
    expect(waitsOnBusyFolder(steps, stateWith({ lastCheck: { ok: false, output: "check failed", atMs: 1 } }))).toBeNull();
    expect(waitsOnBusyFolder(steps, stateWith({ status: "running", approved: true, lastCheck: busy }))).toBeNull();
    const done: BlueprintState = { steps: Object.fromEntries(steps.map((entry) => [entry.id, passed])) };
    expect(waitsOnBusyFolder(steps, done)).toBeNull();
  });
});
