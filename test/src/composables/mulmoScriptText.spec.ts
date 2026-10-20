import { describe, it, expect } from "vitest";
import { canvasNeedsMulmoScript, isMulmoScriptText } from "../../../src/composables/mulmoScriptText";

// #3137. What makes a .json a MulmoScript for the Files pane's Canvas button.
describe("isMulmoScriptText", () => {
  it.each([
    ['{"$mulmocast":{"version":"1.1"},"beats":[]}'],
    ['  {\n  "title": "t",\n  "$mulmocast": {"version": "1.1"}\n}\n'],
    ['{"$mulmocast":null}'],
    ['{"\\u0024mulmocast":{"version":"1.1"}}'],
  ])("takes %j as a MulmoScript", (text) => {
    expect(isMulmoScriptText(text)).toBe(true);
  });

  it.each([
    [""],
    ["{}"],
    ['{"name":"x"}'],
    ['{"meta":{"$mulmocast":{"version":"1.1"}}}'], // not at the root
    ['[{"$mulmocast":{"version":"1.1"}}]'], // an array, not an object
    ['"$mulmocast"'],
    ['{"$mulmocast": {"version": "1.1"}'], // does not parse
    ["$mulmocast"],
    ["null"],
  ])("does not take %j as one", (text) => {
    expect(isMulmoScriptText(text)).toBe(false);
  });
});

describe("canvasNeedsMulmoScript", () => {
  it.each([["s.json"], ["stories/S.JSON"], ["/abs/x.json"]])("asks the content of %j", (path) => {
    expect(canvasNeedsMulmoScript(path)).toBe(true);
  });

  it.each([["a.md"], ["page.html"], ["x.json.bak"], ["json"], [""]])("leaves %j to its name", (path) => {
    expect(canvasNeedsMulmoScript(path)).toBe(false);
  });
});
