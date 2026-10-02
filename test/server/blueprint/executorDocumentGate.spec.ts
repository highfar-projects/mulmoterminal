// @vitest-environment node
// A document build's review gate: there is no spec, so what the person sends changes the files the gate asks them to
// read — the session is told those files, and is never pointed at a spec.
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createExecutor, type BlueprintExecutor } from "../../../server/blueprint/executor";
import { endTurnOf, executorFakes, step, type ExecutorFakes } from "./executorHarness";

let fakes: ExecutorFakes;
let executor: BlueprintExecutor;

beforeEach(() => {
  fakes = executorFakes();
  executor = createExecutor(fakes.deps);
});

describe("talking a document build's files over at its review gate", () => {
  it("hands the session the files the gate names, and the person's words", async () => {
    const outline = { ...step("outline", ["review"]), reads: [".blueprint/brief.md"] };
    await executor.create({ projectDir: "/work/docs", basePackDir: "/packs/docs", usecasePackDir: "/packs/write", steps: [step("brief"), outline] });
    await endTurnOf(fakes)("s1");
    await executor.say("run-00000001", "集合は 9 時に 1 階の受付です");
    const prompt = fakes.spawned[1]?.prompt ?? "";
    expect(prompt).toContain("The person has just read: .blueprint/brief.md.");
    expect(prompt).toContain("集合は 9 時に 1 階の受付です");
    expect(prompt).not.toContain(".blueprint/spec.md");
  });

  it("still points an app build's gate, which names nothing to read, at its spec", async () => {
    await executor.create({
      projectDir: "/work/app",
      basePackDir: "/packs/local",
      usecasePackDir: "/packs/product",
      steps: [step("a"), step("b", ["review"])],
    });
    await endTurnOf(fakes)("s1");
    await executor.say("run-00000001", "本の削除も");
    expect(fakes.spawned[1]?.prompt).toContain("The spec is .blueprint/spec.md");
  });

  const atBriefGate = async () => {
    const outline = { ...step("outline", ["review"]), reads: [".blueprint/outline.txt"], revises: [".blueprint/outline.json"] };
    await executor.create({ projectDir: "/work/docs", basePackDir: "/packs/docs", usecasePackDir: "/packs/write", steps: [step("brief"), outline] });
    await endTurnOf(fakes)("s1");
    await executor.say("run-00000001", "第2章を短くして");
  };

  it("tells the session to change the record and leave the view, which is redrawn", async () => {
    await atBriefGate();
    const prompt = fakes.spawned[1]?.prompt ?? "";
    expect(prompt).toContain("1. Change .blueprint/outline.json — the files the next step reads");
    expect(prompt).toContain(".blueprint/outline.txt is a view drawn from those files: do not edit it.");
  });

  it("runs the step before the gate's check again when the revision ends, and says nothing more when it passes", async () => {
    await atBriefGate();
    fakes.checksRun.length = 0;
    fakes.files.set(".blueprint/reply-s2.md", "短くしました。");
    await endTurnOf(fakes)("s2");
    expect(fakes.checksRun).toEqual(["check-brief"]);
    const { run } = await executor.view("run-00000001");
    expect(run.specChat.map((entry) => entry.outcome)).toEqual([undefined, "reply"]);
  });

  it("adds the check's output to the conversation when the changed files no longer fit", async () => {
    await atBriefGate();
    fakes.checkResults["check-brief"] = [false];
    fakes.files.set(".blueprint/reply-s2.md", "短くしました。");
    await endTurnOf(fakes)("s2");
    const { run } = await executor.view("run-00000001");
    expect(run.specChat.at(-1)).toMatchObject({ role: "agent", outcome: "check-failed", text: "check-brief failed" });
    expect(run.revisionSessionId).toBeNull();
  });

  it("runs no check after an app build's spec revision, or a session that was lost", async () => {
    await executor.create({
      projectDir: "/work/app",
      basePackDir: "/packs/local",
      usecasePackDir: "/packs/product",
      steps: [step("a"), step("b", ["review"])],
    });
    await endTurnOf(fakes)("s1");
    await executor.say("run-00000001", "本の削除も");
    fakes.checksRun.length = 0;
    await endTurnOf(fakes)("s2");
    expect(fakes.checksRun).toEqual([]);
  });

  it("checks the files again even after a lost session, which may have changed them before it ended", async () => {
    await atBriefGate();
    fakes.checksRun.length = 0;
    fakes.checkResults["check-brief"] = [false];
    await endTurnOf(fakes)("s2", true);
    expect(fakes.checksRun).toEqual(["check-brief"]);
    expect((await executor.view("run-00000001")).run.specChat.map((entry) => entry.outcome)).toEqual([undefined, "lost", "check-failed"]);
  });

  it("refuses approval while the last revision's files fail the check, and takes it once a later revision passes", async () => {
    await atBriefGate();
    fakes.checkResults["check-brief"] = [false];
    fakes.files.set(".blueprint/reply-s2.md", "短くしました。");
    await endTurnOf(fakes)("s2");
    await expect(executor.humanEvent("run-00000001", "outline", { type: "approve" })).rejects.toMatchObject({ refusal: { code: "revision-check-failed" } });
    await executor.say("run-00000001", "形を戻して");
    fakes.files.set(".blueprint/reply-s3.md", "戻しました。");
    await endTurnOf(fakes)("s3");
    await executor.humanEvent("run-00000001", "outline", { type: "approve" });
    expect((await executor.view("run-00000001")).state.steps.outline?.status).not.toBe("awaiting-approval");
  });

  it("still lets the person stop a build whose revision failed the check", async () => {
    await atBriefGate();
    fakes.checkResults["check-brief"] = [false];
    await endTurnOf(fakes)("s2");
    await executor.humanEvent("run-00000001", "outline", { type: "reject", reason: "やめる" });
    expect((await executor.view("run-00000001")).state.steps.outline).toMatchObject({ status: "failed", reason: "やめる" });
  });

  it("takes the files to change from the pack for a build started before the pack declared them", async () => {
    const packs = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
    const draft = { ...step("draft", ["review"]), reads: [".blueprint/outline.txt"] };
    await executor.create({
      projectDir: "/work/docs",
      basePackDir: path.join(packs, "docs"),
      usecasePackDir: path.join(packs, "write"),
      steps: [step("outline"), { ...draft, origin: "usecase" }],
    });
    await endTurnOf(fakes)("s1");
    await executor.say("run-00000001", "筆記用具も足して");
    const prompt = fakes.spawned[1]?.prompt ?? "";
    expect(prompt).toContain("1. Change .blueprint/outline.json — the files the next step reads");
    expect(prompt).toContain(".blueprint/outline.txt is a view drawn from those files: do not edit it.");
  });
});
