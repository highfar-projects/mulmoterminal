// @vitest-environment node
// The executor the routes are handed: its reads reach the real executor with every argument, so a route's screen
// language is not dropped on the way.
import { describe, expect, it } from "vitest";
import { lockedExecutor } from "../../../server/blueprint/wiring";
import type { BlueprintExecutor } from "../../../server/blueprint/executor";

const unused = async (): Promise<never> => {
  throw new Error("not used here");
};

describe("the locked executor's reads", () => {
  it("forward every argument they are given", async () => {
    const seen: unknown[][] = [];
    const inner: BlueprintExecutor = {
      create: unused,
      view: async (...args) => {
        seen.push(["view", ...args]);
        return unused();
      },
      list: async (...args) => {
        seen.push(["list", ...args]);
        return [];
      },
      humanEvent: unused,
      ask: unused,
      recover: unused,
      specView: unused,
      targetsView: unused,
      say: unused,
      reportView: unused,
      workingIn: async (...args) => {
        seen.push(["workingIn", ...args]);
        return null;
      },
      archive: unused,
    };
    const { executor } = lockedExecutor(inner);
    await executor.list("en");
    await executor.workingIn("/work");
    await executor.view("run-1").catch(() => undefined);
    expect(seen).toEqual([
      ["list", "en"],
      ["workingIn", "/work"],
      ["view", "run-1"],
    ]);
  });
});
