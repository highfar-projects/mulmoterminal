import { describe, it, expect } from "vitest";
import { DIR_FORM_FIELDS, editForInput, inputText, type DirFormField } from "../../../src/components/dirSettingsFormFields";
import { DIR_FORM_KEYS } from "../../../common/dirConfigForm";

const field = (key: DirFormField["key"]): DirFormField => {
  const found = DIR_FORM_FIELDS.find((entry) => entry.key === key);
  if (!found) throw new Error(`no field ${key}`);
  return found;
};

describe("DIR_FORM_FIELDS", () => {
  it("has exactly one row per form key", () => {
    expect(DIR_FORM_FIELDS.map((entry) => entry.key).sort()).toEqual([...DIR_FORM_KEYS].sort());
  });
});

describe("editForInput", () => {
  it.each([
    ["name", "  shop ", { set: { name: "shop" }, unset: [] }],
    ["name", "   ", { set: {}, unset: ["name"] }],
    ["fontFamily", "Menlo", { set: { fontFamily: "Menlo" }, unset: [] }],
    ["theme", "dark", { set: { theme: "dark" }, unset: [] }],
    ["theme", "", { set: {}, unset: ["theme"] }],
    ["fontSize", "14", { set: { fontSize: 14 }, unset: [] }],
    ["fontSize", "", { set: {}, unset: ["fontSize"] }],
    ["orderPriority", "-2", { set: { orderPriority: -2 }, unset: [] }],
    ["headerColor", "#AABBCC", { set: { headerColor: "#aabbcc" }, unset: [] }],
  ] as const)("%s %j", (key, raw, edit) => {
    expect(editForInput(field(key), raw)).toEqual(edit);
  });

  it.each([
    ["fontSize", "14.5"],
    ["fontSize", "abc"],
    ["orderPriority", "1e400"],
    ["headerColor", ""],
    ["headerColor", "#abc"],
    ["headerColor", "red"],
  ] as const)("refuses %s %j", (key, raw) => {
    expect(editForInput(field(key), raw)).toBeNull();
  });
});

describe("inputText", () => {
  it.each([
    ["name", "shop", "shop"],
    ["name", 3, ""],
    ["name", undefined, ""],
    ["fontSize", 14, "14"],
    ["fontSize", "14", ""],
    ["fontSize", Number.NaN, ""],
    ["headerColor", "#112233", "#112233"],
  ] as const)("%s %j -> %j", (key, value, text) => {
    expect(inputText(field(key), value)).toBe(text);
  });
});
