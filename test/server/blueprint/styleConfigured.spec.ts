// @vitest-environment node
// Which rules a style's chaff.yaml sets, and which of those no counter text is shown to trip.
import { describe, it, expect } from "vitest";
import { configuredRules, unprovenRules } from "../../../blueprints/style/checks/configured.mjs";

const rule = (id: string, level?: string, from = "/work/chaff.yaml") => ({ id, ...(level === undefined ? {} : { your_setting: { level, from } }) });

describe("configuredRules", () => {
  it("gives each rule set from chaff.yaml with its level, and nothing set elsewhere", () => {
    const current = { rules: [rule("a", "normal"), rule("b", "relaxed"), rule("c"), rule("d", "strict", "/defaults/genre.yaml")] };
    expect(Object.fromEntries(configuredRules(current, "chaff.yaml"))).toEqual({ a: "normal", b: "relaxed" });
  });

  it("gives nothing for output that is not a rules list", () => {
    expect(configuredRules(null, "chaff.yaml").size).toBe(0);
    expect(configuredRules({ rules: "x" }, "chaff.yaml").size).toBe(0);
  });
});

describe("unprovenRules", () => {
  it("names every rule turned on that no finding shows firing, and never one turned off", () => {
    const configured = new Map([
      ["contraction-consistency", "normal"],
      ["max-sentence-length", "relaxed"],
      ["ai-tell", "off"],
    ]);
    expect(unprovenRules(configured, [{ rule: "max-sentence-length" }])).toEqual(["contraction-consistency"]);
    expect(unprovenRules(configured, [{ rule: "max-sentence-length" }, { rule: "contraction-consistency" }])).toEqual([]);
    expect(unprovenRules(new Map(), [])).toEqual([]);
  });
});
