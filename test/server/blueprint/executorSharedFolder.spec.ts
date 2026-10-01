// @vitest-environment node
// Builds that share a folder: each works with its own interview answers (written back when its session starts),
// and a second build's agent never starts while another is working there. Against the executor fakes.
import { describe, it, expect, beforeEach } from "vitest";
import { createExecutor, type BlueprintExecutor, type ExecutorDeps } from "../../../server/blueprint/executor";
import { endTurnOf, executorFakes, step, type ExecutorFakes } from "./executorHarness";
import type { BlueprintState } from "../../../common/blueprint/state";

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
    expect(waiting?.lastCheck?.notice).toEqual({ code: "folder-busy", runId: first });
    expect(written.at(-1)?.answers).toEqual({ documents: "a.md" });
  });

  it("keeps the waiting step waiting while the other build works, even when a person retries it", async () => {
    await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" });
    await executor.humanEvent(second, "a", { type: "retry" });
    expect(spawned).toHaveLength(1);
    expect((await stepOfRun(second, "a"))?.lastCheck?.notice?.code).toBe("folder-busy");
  });

  it("starts the waiting step by itself once the other build stops working", async () => {
    await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" });
    await endTurn("s1");
    expect(spawned).toHaveLength(2);
    expect((await stepOfRun(second, "a"))?.status).toBe("running");
    expect(written.at(-1)?.answers).toEqual({ documents: "b.md" });
  });

  it("wakes waiting builds one at a time: the first takes the folder, the next waits for it", async () => {
    await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" });
    const third = await start({ documents: "c.md" });
    await endTurn("s1");
    expect(spawned).toHaveLength(2);
    expect((await stepOfRun(second, "a"))?.status).toBe("running");
    expect((await stepOfRun(third, "a"))?.lastCheck?.notice?.code).toBe("folder-busy");
    await endTurn("s2");
    expect(spawned).toHaveLength(3);
    expect((await stepOfRun(third, "a"))?.status).toBe("running");
  });

  it("wakes a build left waiting across a restart, once the folder is free", async () => {
    const first = await start({ documents: "a.md" });
    const second = await start({ documents: "b.md" });
    // The first build reached its review gate while the server was down: no turn ended here to wake the second.
    const stopped = await executor.view(first);
    const atGate: BlueprintState = {
      steps: {
        ...stopped.state.steps,
        a: { status: "passed", approved: false, answers: [], lastCheck: { ok: true, output: "", atMs: 1 } },
        b: { status: "awaiting-approval", approved: false, answers: [] },
      },
    };
    await fakes.store.save({ ...stopped.run, activeSessionId: null }, atGate);
    await executor.recover(() => undefined);
    expect((await stepOfRun(second, "a"))?.status).toBe("running");
  });

  it("retries writing the answers by itself, and starts once it works", async () => {
    let failures = 2;
    executor = createExecutor({
      ...deps,
      writeAnswers: async () => {
        if (failures-- > 0) throw new Error("disk busy");
      },
    });
    const runId = await start({ documents: "a.md" });
    expect((await stepOfRun(runId, "a"))?.status).toBe("running");
    expect(spawned).toHaveLength(1);
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
    await expect(executor.say("run-00000001", "本の削除も入れて")).rejects.toMatchObject({
      refusal: { code: "folder-busy", dir: "/work/app", runId: "run-00000002" },
    });
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
    expect(failed?.lastCheck?.notice).toEqual({ code: "answers-unwritten", detail: "disk full" });
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
