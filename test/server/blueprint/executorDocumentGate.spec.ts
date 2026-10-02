// @vitest-environment node
// A document build's review gate: there is no spec, so what the person sends changes the files the gate asks them to
// read — the session is told those files, and is never pointed at a spec.
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
});
