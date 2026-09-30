// @vitest-environment node
// The Settings form's save, without a disk (#2722): what a request may ask for, which file each key
// lands in, and how one file's text changes.
import { describe, it, expect } from "vitest";
import { applyEditToText, detectIndent, isEmptyEdit, parseDirConfigEdit, splitEditByFile } from "../../../server/config/dir-config-edit";
import { isWritableDirConfigValue } from "../../../server/config/config-schema";
import { DIR_FORM_KEYS } from "../../../common/dirConfigForm";
import { DIR_CONFIG_KEYS } from "../../../common/dirConfigSource";

const acceptAll = () => true;

describe("parseDirConfigEdit", () => {
  it("reads set and unset", () => {
    expect(parseDirConfigEdit({ set: { name: "shop" }, unset: ["theme"] }, acceptAll)).toEqual({ set: { name: "shop" }, unset: ["theme"] });
  });

  it("treats a missing half as empty", () => {
    expect(parseDirConfigEdit({ unset: ["name"] }, acceptAll)).toEqual({ set: {}, unset: ["name"] });
    expect(parseDirConfigEdit({ set: { fontSize: 14 } }, acceptAll)).toEqual({ set: { fontSize: 14 }, unset: [] });
  });

  it.each([
    ["a non-object body", null],
    ["an array body", []],
    ["a string body", "name"],
    ["set as an array", { set: ["name"] }],
    ["unset as an object", { unset: { name: true } }],
    ["nothing to change", {}],
    ["empty halves", { set: {}, unset: [] }],
    ["a key the form does not write", { set: { sound: "a.mp3" } }],
    ["a misspelt key", { set: { badgeColour: "#ffffff" } }],
    ["an unknown key to unset", { unset: ["buttons"] }],
    ["a non-string key to unset", { unset: [3] }],
    ["the same key set and unset", { set: { name: "x" }, unset: ["name"] }],
  ])("refuses %s", (_label, body) => {
    expect(typeof parseDirConfigEdit(body, acceptAll)).toBe("string");
  });

  it("refuses a value the check rejects and names the key", () => {
    expect(parseDirConfigEdit({ set: { fontSize: 99 } }, () => false)).toContain("fontSize");
  });
});

describe("isWritableDirConfigValue on the form's keys", () => {
  it.each([
    ["name", "shop", true],
    ["name", "", false],
    ["name", "   ", false],
    ["headerColor", "#1a2b3c", true],
    ["headerColor", "#fff", false],
    ["headerColor", "red", false],
    ["fontSize", 14, true],
    ["fontSize", 14.5, false],
    ["fontSize", 2, false],
    ["fontSize", "14", false],
    ["fontFamily", "Menlo, monospace", true],
    ["fontFamily", "", false],
    ["orderPriority", -3, true],
    ["orderPriority", 1.5, false],
    ["theme", "dark", true],
    ["theme", null, false],
  ] as const)("%s = %j -> %s", (key, value, expected) => {
    expect(isWritableDirConfigValue(key, value)).toBe(expected);
  });

  it("has a rule for every form key", () => {
    DIR_FORM_KEYS.forEach((key) => expect(DIR_CONFIG_KEYS).toContain(key));
  });
});

describe("splitEditByFile", () => {
  it("writes a key the local file holds to the local file, and the rest to the shared one", () => {
    const split = splitEditByFile({ set: { name: "a", headerColor: "#000000" }, unset: [] }, ["headerColor"]);
    expect(split.shared).toEqual({ set: { name: "a" }, unset: [] });
    expect(split.local).toEqual({ set: { headerColor: "#000000" }, unset: [] });
  });

  it("unsets from the shared file always, and from the local one only where it is", () => {
    const split = splitEditByFile({ set: {}, unset: ["name", "theme"] }, ["theme"]);
    expect(split.shared.unset).toEqual(["name", "theme"]);
    expect(split.local.unset).toEqual(["theme"]);
  });

  it("leaves the local file with nothing to do when it holds none of the keys", () => {
    expect(isEmptyEdit(splitEditByFile({ set: { name: "a" }, unset: ["theme"] }, []).local)).toBe(true);
  });
});

describe("detectIndent", () => {
  it.each([
    ['{\n  "a": 1\n}', "  "],
    ['{\n    "a": 1\n}', "    "],
    ['{\n\t"a": 1\n}', "\t"],
    ['{"a": 1}', "  "],
    ["", "  "],
  ])("%j -> %j", (text, indent) => {
    expect(detectIndent(text)).toBe(indent);
  });
});

describe("applyEditToText", () => {
  it("creates an object for a file that does not exist", () => {
    expect(applyEditToText(null, { set: { name: "shop" }, unset: [] })).toBe('{\n  "name": "shop"\n}\n');
  });

  it("treats an empty file as an empty object", () => {
    expect(applyEditToText("  \n", { set: { fontSize: 14 }, unset: [] })).toBe('{\n  "fontSize": 14\n}\n');
  });

  it("keeps keys it does not name, in their order, and changes a key in place", () => {
    const before = JSON.stringify({ buttons: [{ label: "x" }], name: "old", sound: "a.mp3" }, null, 2);
    const after = applyEditToText(before, { set: { name: "new", theme: "dark" }, unset: [] });
    expect(after).toBe(`${JSON.stringify({ buttons: [{ label: "x" }], name: "new", sound: "a.mp3", theme: "dark" }, null, 2)}\n`);
  });

  it("removes an unset key and keeps the rest", () => {
    expect(applyEditToText('{"name":"a","typo":1}', { set: {}, unset: ["name"] })).toBe('{\n  "typo": 1\n}\n');
  });

  it("keeps the file's indent", () => {
    expect(applyEditToText('{\n\t"name": "a"\n}\n', { set: { fontSize: 12 }, unset: [] })).toBe('{\n\t"name": "a",\n\t"fontSize": 12\n}\n');
  });

  it.each([
    ["broken JSON", '{"name": "a",'],
    ["an array", "[1, 2]"],
    ["a string", '"name"'],
    ["null", "null"],
  ])("refuses %s rather than replacing it", (_label, text) => {
    expect(applyEditToText(text, { set: { name: "a" }, unset: [] })).toBeNull();
  });
});
