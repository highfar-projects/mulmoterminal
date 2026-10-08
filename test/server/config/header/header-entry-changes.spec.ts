// @vitest-environment node
// What one Settings request does to a list of header buttons or chips (#2727), decided once for the
// global lists and a directory's. The global routes' own specs pin their behaviour end to end; this
// pins the request reading both sides share, including what an unconfigured list starts from.
import { describe, it, expect } from "vitest";
import { buttonChangeFor, chipChangeFor, withNewIdsClearOf } from "../../../../server/config/header/header-entry-changes";

const build = { id: "build", label: "Build", run: "shell" as const, cmd: "yarn build" };

describe("buttonChangeFor", () => {
  it.each([
    ["add", { run: "bogus" }, "run must be shell, input, open or action"],
    ["edit", { run: "shell" }, "id and a run of shell, input, open or action are required"],
    ["edit", { id: "build" }, "id and a run of shell, input, open or action are required"],
    ["move", { id: "build", delta: 2 }, "id and a delta of -1 or 1 are required"],
    ["move", { delta: 1 }, "id and a delta of -1 or 1 are required"],
    ["remove", {}, "id is required"],
    ["into-folder", { id: 3 }, "id is required"],
    ["out-of-folder", {}, "id is required"],
    ["folder-edit", {}, "id is required"],
    ["explode", { id: "build" }, "unknown action: explode"],
  ])("refuses %s %j", (action, body, message) => {
    expect(buttonChangeFor(action, body, [])).toBe(message);
  });

  it("starts an unconfigured list from the defaults it is given", () => {
    const add = buttonChangeFor("add", { run: "input", label: "Compact", payload: "/compact" }, []);
    if (typeof add === "string") throw new Error(add);
    expect(add(null)).toEqual({ entries: [{ id: "compact", label: "Compact", run: "input", text: "/compact" }] });
    const addToDefaults = buttonChangeFor("add", { run: "input", label: "Compact", payload: "/compact" }, [build]);
    if (typeof addToDefaults === "string") throw new Error(addToDefaults);
    expect(addToDefaults(null)).toEqual({ entries: [build, { id: "compact", label: "Compact", run: "input", text: "/compact" }] });
  });

  it("removes and moves by id against the list it is handed", () => {
    const list = [build, { id: "lint", label: "Lint", run: "shell" as const, cmd: "yarn lint" }];
    const remove = buttonChangeFor("remove", { id: "build" }, []);
    const move = buttonChangeFor("move", { id: "lint", delta: -1 }, []);
    if (typeof remove === "string" || typeof move === "string") throw new Error("unexpected refusal");
    expect(remove(list)).toEqual({ entries: [list[1]] });
    expect(move(list)).toEqual({ entries: [list[1], build] });
  });
});

describe("chipChangeFor", () => {
  it.each([
    ["remove", { index: "0", chip: "git" }, "index and chip are required"],
    ["remove", { index: 0 }, "index and chip are required"],
    ["move", { index: 0, chip: "git", delta: 2 }, "index, chip and a delta of -1 or 1 are required"],
    ["move", { chip: "git", delta: 1 }, "index, chip and a delta of -1 or 1 are required"],
    ["explode", {}, "unknown action: explode"],
  ])("refuses %s %j", (action, body, message) => {
    expect(chipChangeFor(action, body)).toBe(message);
  });

  it("adds to an empty list, and refuses a remove whose chip is not at that index", () => {
    const add = chipChangeFor("add", { builtin: "git" });
    const remove = chipChangeFor("remove", { index: 0, chip: "diff" });
    if (typeof add === "string" || typeof remove === "string") throw new Error("unexpected refusal");
    expect(add([])).toEqual({ chips: ["git"] });
    expect(remove(["git"])).toEqual({ problem: "stale" });
  });
});

describe("withNewIdsClearOf", () => {
  const cmd = (id: string) => ({ id, label: id, run: "shell" as const, cmd: id });

  it("moves a new id off the reserved ones, and leaves the ids the list already had", () => {
    const previous = [cmd("deploy")];
    const next = [cmd("deploy"), cmd("build")];
    expect(withNewIdsClearOf(next, previous, new Set(["build", "deploy"])).map((entry) => entry.id)).toEqual(["deploy", "build-2"]);
  });

  it("keeps clear of the list's own ids too", () => {
    expect(withNewIdsClearOf([cmd("build-2"), cmd("build")], [cmd("build-2")], new Set(["build"])).map((entry) => entry.id)).toEqual(["build-2", "build-3"]);
  });

  it("changes nothing when no new id is reserved", () => {
    const next = [cmd("a"), cmd("b")];
    expect(withNewIdsClearOf(next, [cmd("a")], new Set(["c"]))).toEqual(next);
  });
});
