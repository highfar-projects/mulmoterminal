// @vitest-environment node
// A step whose check keeps failing does not stop at the first few tries: once enough attempts in a row have failed,
// the next is a repair — shown every failure so far and told to find why they all failed — before a person is asked.
import { describe, it, expect, beforeEach } from "vitest";
import { createExecutor, type BlueprintExecutor } from "../../../server/blueprint/executor";
import { MAX_FAILED_CHECKS, REPAIR_AFTER } from "../../../common/blueprint/executorPolicy";
import { endTurnOf, executorFakes, step, type ExecutorFakes } from "./executorHarness";

let fakes: ExecutorFakes;
let executor: BlueprintExecutor;
beforeEach(() => {
  fakes = executorFakes();
  executor = createExecutor(fakes.deps);
});

const create = () =>
  executor.create({ projectDir: "/work/app", basePackDir: "/packs/firebase", usecasePackDir: "/packs/internal", steps: [step("a"), step("b")] });
const endTurn = (sessionId: string) => endTurnOf(fakes)(sessionId, false);
const attempts = (count: number) => Array.from({ length: count }, (_, index) => `s${index + 1}`);

describe("repair attempts", () => {
  it("keeps the first attempts plain, and makes the later ones repairs that see every failure", async () => {
    fakes.checkResults["check-a"] = Array.from({ length: MAX_FAILED_CHECKS }, () => false);
    await create();
    await attempts(MAX_FAILED_CHECKS).reduce((done, sessionId) => done.then(() => endTurn(sessionId)), Promise.resolve());
    const prompts = fakes.spawned.map((spawn) => spawn.prompt);
    expect(prompts).toHaveLength(MAX_FAILED_CHECKS);
    expect(prompts[1]).not.toContain("Earlier attempts failed");
    expect(prompts[2]).toContain("Earlier attempts failed");
    expect(prompts[REPAIR_AFTER - 1]).not.toContain("This is a repair attempt");
    expect(prompts[REPAIR_AFTER]).toContain(`This is a repair attempt: ${REPAIR_AFTER} attempts in a row`);
    expect(prompts[REPAIR_AFTER]?.match(/Attempt \d+:/g)).toHaveLength(REPAIR_AFTER - 1);
    expect((await executor.view("run-00000001")).state.steps.a?.status).toBe("failed");
  });

  it("forgets the failures when a person retries, and when the check passes", async () => {
    fakes.checkResults["check-a"] = [...Array.from({ length: MAX_FAILED_CHECKS }, () => false), true];
    await create();
    await attempts(MAX_FAILED_CHECKS).reduce((done, sessionId) => done.then(() => endTurn(sessionId)), Promise.resolve());
    expect((await executor.view("run-00000001")).run.failureOutputs.a).toHaveLength(MAX_FAILED_CHECKS);
    await executor.humanEvent("run-00000001", "a", { type: "retry" });
    expect((await executor.view("run-00000001")).run.failureOutputs.a).toEqual([]);
    expect(fakes.spawned.at(-1)?.prompt).not.toContain("Earlier attempts failed");
    await endTurn(fakes.spawned.at(-1)?.sessionId ?? "");
    const after = await executor.view("run-00000001");
    expect(after.state.steps.a?.status).toBe("passed");
    expect(after.run.failureOutputs.a).toEqual([]);
  });

  it("forgets the failures once an automatic retry passes", async () => {
    fakes.checkResults["check-a"] = [false, true];
    await create();
    await endTurn("s1");
    expect((await executor.view("run-00000001")).run.failureOutputs.a).toEqual(["check-a failed"]);
    await endTurn("s2");
    expect((await executor.view("run-00000001")).run.failureOutputs.a).toEqual([]);
  });
});
