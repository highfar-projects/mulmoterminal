// @vitest-environment node
// Builds that share a folder: each works with its own interview answers (written back when its session starts),
// and a second build's agent never starts while another is working there. Against the executor fakes.
import { describe, it, expect, beforeEach } from "vitest";
import { createExecutor, type BlueprintExecutor, type ExecutorDeps } from "../../../server/blueprint/executor";
import { endTurnOf, executorFakes, step, type ExecutorFakes } from "./executorHarness";

const STEPS = [step("a"), step("b", ["billing", "review"]), step("c")];

let fakes: ExecutorFakes;
let spawned: ExecutorFakes["spawned"];
let deps: ExecutorDeps;
let executor: BlueprintExecutor;

beforeEach(() => {
  fakes = executorFakes();
  ({ spawned, deps } = fakes);
  executor = createExecutor(deps);
});

const endTurn = (sessionId: string, didError = false) => endTurnOf(fakes)(sessionId, didError);

describe("a build's own answers, when builds share a folder", () => {
  let written: { dir: string; answers: Record<string, unknown> }[];
  let atCheck: Record<string, unknown>[];
  let ids: number;

  beforeEach(() => {
    written = [];
    atCheck = [];
    ids = 0;
    executor = createExecutor({
      ...deps,
      newRunId: () => `run-0000000${++ids}`,
      writeAnswers: async (dir, answers) => void written.push({ dir, answers }),
      // What .blueprint/answers.json holds at the moment each check runs.
      runCheck: async (request) => {
        atCheck.push(written.at(-1)?.answers ?? {});
        return deps.runCheck(request);
      },
    });
  });

  // b carries a review gate: a build stops there for a person after a passes.
  const start = (answers: Record<string, string>, projectDir = "/work/docs") =>
    executor.create({ projectDir, basePackDir: "/packs/docs", usecasePackDir: "/packs/review", steps: [step("a"), step("b", ["review"])], answers });
  const stepOfRun = async (runId: string, stepId: string) => (await executor.view(runId)).state.steps[stepId];

  it("keeps the answers in the build, and writes them back before the session starts", async () => {
    const runId = await start({ documents: "a.md" });
    expect((await executor.view(runId)).run.answers).toEqual({ documents: "a.md" });
    expect(written).toEqual([{ dir: "/work/docs", answers: { documents: "a.md" } }]);
    expect(spawned).toHaveLength(1);
  });

  it("makes the answers its own again when a waiting build resumes after another wrote theirs", async () => {
    const first = await start({ documents: "a.md" });
    await endTurn("s1");
    const second = await start({ documents: "b.md" });
    expect(written.at(-1)?.answers).toEqual({ documents: "b.md" });
    await endTurn("s2");
    atCheck.length = 0;
    await executor.humanEvent(first, "b", { type: "approve" });
    expect(written.at(-1)?.answers).toEqual({ documents: "a.md" });
    await endTurn("s3");
    expect(atCheck[0]).toEqual({ documents: "a.md" });
    expect(second).not.toBe(first);
  });

  it("does not start a second build's agent while another is working in the folder; that step waits for a retry", async () => {
    const first = await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" }, "/work/docs/");
    expect(spawned).toHaveLength(1);
    const waiting = await stepOfRun(second, "a");
    expect(waiting?.status).toBe("failed");
    expect(waiting?.lastCheck?.output).toContain(first);
    expect(written.at(-1)?.answers).toEqual({ documents: "a.md" });
  });

  it("starts the waiting step once a person retries it after the other build stopped", async () => {
    await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" });
    await executor.humanEvent(second, "a", { type: "retry" });
    expect(spawned).toHaveLength(1);
    await endTurn("s1");
    await executor.humanEvent(second, "a", { type: "retry" });
    expect(spawned).toHaveLength(2);
    expect(written.at(-1)?.answers).toEqual({ documents: "b.md" });
  });

  it("starts beside a build that works in another folder", async () => {
    await start({ documents: "a.md" });
    await start({ documents: "b.md" }, "/work/other");
    expect(spawned).toHaveLength(2);
  });

  it("refuses a spec revision while another build is working in the folder", async () => {
    await executor.create({ projectDir: "/work/app", basePackDir: "/packs/firebase", usecasePackDir: "/packs/internal", steps: STEPS, answers: { app: "A" } });
    await endTurn("s1");
    await start({ documents: "b.md" }, "/work/app");
    await expect(executor.say("run-00000001", "本の削除も入れて")).rejects.toThrow("is working in this folder");
  });

  it("makes the answers its own again before a spec revision session, too", async () => {
    await executor.create({ projectDir: "/work/app", basePackDir: "/packs/firebase", usecasePackDir: "/packs/internal", steps: STEPS, answers: { app: "A" } });
    await endTurn("s1");
    await start({ documents: "b.md" }, "/work/app");
    await endTurn("s2");
    expect(written.at(-1)?.answers).toEqual({ documents: "b.md" });
    await executor.say("run-00000001", "本の削除も入れて");
    expect(written.at(-1)?.answers).toEqual({ app: "A" });
  });

  it("names a working build by its folder however the folder is spelled, and ignores a waiting one", async () => {
    const first = await start({ documents: "a.md" });
    expect(await executor.workingIn("/work/docs/")).toBe(first);
    expect(await executor.workingIn("/work/other")).toBeNull();
    await endTurn("s1");
    expect(await executor.workingIn("/work/docs")).toBeNull();
  });

  it("counts a build whose check is still running as working", async () => {
    let release: () => void = () => undefined;
    fakes.checkGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = await start({ documents: "a.md" });
    const ended = endTurn("s1");
    await Promise.resolve();
    expect(await executor.workingIn("/work/docs")).toBe(first);
    release();
    await ended;
    fakes.checkGate = null;
  });

  it("fails the step, and leaves the folder free, when writing the answers fails at its start", async () => {
    executor = createExecutor({
      ...deps,
      writeAnswers: async () => {
        throw new Error("disk full");
      },
    });
    const runId = await start({ documents: "a.md" });
    const failed = await stepOfRun(runId, "a");
    expect(failed?.status).toBe("failed");
    expect(failed?.lastCheck?.output).toContain("disk full");
    expect(spawned).toHaveLength(0);
    expect(await executor.workingIn("/work/docs")).toBeNull();
  });

  it("records no revision when writing the answers fails", async () => {
    let failing = false;
    executor = createExecutor({
      ...deps,
      writeAnswers: async () => {
        if (failing) throw new Error("disk full");
      },
    });
    await executor.create({ projectDir: "/work/app", basePackDir: "/packs/firebase", usecasePackDir: "/packs/internal", steps: STEPS, answers: { app: "A" } });
    await endTurn("s1");
    failing = true;
    await expect(executor.say("run-00000001", "本の削除も入れて")).rejects.toThrow("disk full");
    expect((await executor.view("run-00000001")).run.revisionSessionId).toBeNull();
    expect(await executor.workingIn("/work/app")).toBeNull();
  });

  it("counts a build whose spec is being revised as working", async () => {
    await executor.create({ projectDir: "/work/app", basePackDir: "/packs/firebase", usecasePackDir: "/packs/internal", steps: STEPS, answers: { app: "A" } });
    await endTurn("s1");
    await executor.say("run-00000001", "本の削除も入れて");
    expect(await executor.workingIn("/work/app")).toBe("run-00000001");
    const second = await start({ documents: "b.md" }, "/work/app");
    expect((await stepOfRun(second, "a"))?.status).toBe("failed");
  });

  it("leaves the file alone for a build with no answers kept (one recorded before they were)", async () => {
    await start({});
    expect(written).toEqual([]);
  });
});
