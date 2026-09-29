// @vitest-environment node
// Naming where a quotation sits for the person: a Markdown section by its heading, since chaff's address for it
// (h1.3) tells nobody anything.
import { describe, it, expect } from "vitest";
import { headingsIn, namesPlace } from "../../../blueprints/docs/checks/places.mjs";

describe("headingsIn", () => {
  it("maps every section address in a chaff tree to its heading, however deep", () => {
    const tree = {
      kind: "doc",
      address: "",
      children: [
        {
          kind: "section",
          address: "h1",
          attrs: { heading: "案内" },
          children: [
            { kind: "section", address: "h1.1", attrs: { heading: "用意するもの" }, children: [{ kind: "quantity", address: "", attrs: { value: 1 } }] },
            { kind: "section", address: "h1.2", attrs: { heading: "動かす" }, children: [] },
          ],
        },
      ],
    };
    expect([...headingsIn(tree)]).toEqual([
      ["h1", "案内"],
      ["h1.1", "用意するもの"],
      ["h1.2", "動かす"],
    ]);
  });

  it("leaves out what is not a section with a heading, and survives what is not a tree", () => {
    expect([
      ...headingsIn({
        kind: "doc",
        children: [
          { kind: "article", address: "第4条", attrs: {} },
          { kind: "section", address: "h1" },
        ],
      }),
    ]).toEqual([]);
    expect([...headingsIn(null)]).toEqual([]);
    expect([...headingsIn({ children: "x" })]).toEqual([]);
  });
});

describe("namesPlace", () => {
  it("is true for the address as written, or the section's heading", () => {
    expect(namesPlace("検収後30日以内です（第4条第2項）。", "第4条第2項", undefined)).toBe(true);
    expect(namesPlace("押します（「作業用フォルダを信頼しておく」）。", "h1.3", "作業用フォルダを信頼しておく")).toBe(true);
    expect(namesPlace("押します（h1.3）。", " h1.3 ", "作業用フォルダを信頼しておく")).toBe(true);
  });

  it("takes a heading only in quotation marks, so an ordinary word does not count by accident", () => {
    expect(namesPlace("期限までに連絡してください。", "h1.1", "期限")).toBe(false);
    expect(namesPlace("書いてあります（「期限」）。", "h1.1", "期限")).toBe(true);
    expect(namesPlace('It is under "Getting started".', "h1.2", "Getting started")).toBe(true);
    expect(namesPlace("It is under “Getting started”.", "h1.2", "Getting started")).toBe(true);
    expect(namesPlace("It is under Getting started.", "h1.2", "Getting started")).toBe(false);
  });

  it("is false when neither is there, and an empty heading names nothing", () => {
    expect(namesPlace("押します。", "h1.3", "作業用フォルダを信頼しておく")).toBe(false);
    expect(namesPlace("押します。", "h1.3", "")).toBe(false);
    expect(namesPlace("押します。", "h1.3", undefined)).toBe(false);
  });
});
