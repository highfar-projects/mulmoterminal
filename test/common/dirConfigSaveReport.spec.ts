// @vitest-environment node
import { describe, it, expect } from "vitest";
import { dirConfigSaveReport, readDirConfigSaveReport } from "../../common/dirConfigSaveReport";

const NONE = { ignored: [], unknown: [] };

describe("dirConfigSaveReport", () => {
  it("is parsed only for a JSON object", () => {
    expect(dirConfigSaveReport('{"name":"x"}', NONE).parsed).toBe(true);
    expect(dirConfigSaveReport("{}", NONE).parsed).toBe(true);
    ["", "[]", "null", '"x"', "1", '{"a":1,}', "{", "// c\n{}"].forEach((text) => expect(dirConfigSaveReport(text, NONE).parsed).toBe(false));
  });

  it("carries the keys that did not take, as copies", () => {
    const source = { ignored: ["headerColor"], unknown: ["colour"] };
    const report = dirConfigSaveReport("{}", source);
    expect(report).toEqual({ parsed: true, ignored: ["headerColor"], unknown: ["colour"] });
    expect(report.ignored).not.toBe(source.ignored);
  });
});

describe("readDirConfigSaveReport", () => {
  it("reads back what the server sends", () => {
    const report = dirConfigSaveReport("{}", { ignored: ["a"], unknown: ["b"] });
    expect(readDirConfigSaveReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });

  it("is null when there is no report, and drops what is not a string", () => {
    [undefined, null, "x", [], {}, { parsed: "yes" }].forEach((value) => expect(readDirConfigSaveReport(value)).toBeNull());
    expect(readDirConfigSaveReport({ parsed: true, ignored: ["a", 1, null], unknown: "b" })).toEqual({ parsed: true, ignored: ["a"], unknown: [] });
  });
});
