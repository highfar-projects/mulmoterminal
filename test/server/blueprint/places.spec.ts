// @vitest-environment node
// Naming where a quotation sits for the person: a Markdown section by its heading, since chaff's address for it
// (h1.3) tells nobody anything.
import { describe, it, expect } from "vitest";
import { headingsIn, namesPlace, placeNamer, placeNamesIn } from "../../../blueprints/docs/checks/places.mjs";

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

  it("takes the place's name too, spaces aside, and an empty or missing name names nothing", () => {
    expect(namesPlace("期限は第4条第2項にあります。", "4.2", undefined, "第4条第2項")).toBe(true);
    expect(namesPlace("It is due under Section 3.2(a).", "3.2.a", undefined, "Section 3.2 (a)")).toBe(true);
    expect(namesPlace("期限は第4条にあります。", "4.2", undefined, "第4条第2項")).toBe(false);
    expect(namesPlace("押します。", "4.2", undefined, "")).toBe(false);
    expect(namesPlace("押します。", "4.2", undefined, " ")).toBe(false);
  });

  it("is false when neither is there, and an empty heading names nothing", () => {
    expect(namesPlace("押します。", "h1.3", "作業用フォルダを信頼しておく")).toBe(false);
    expect(namesPlace("押します。", "h1.3", "")).toBe(false);
    expect(namesPlace("押します。", "h1.3", undefined)).toBe(false);
  });
});

describe("placeNamesIn", () => {
  const node = (kind: string, address: string, attrs: Record<string, string>, children: unknown[] = []) => ({ kind, address, attrs, children });

  it("names a Japanese contract's article by its label, and what is below it as the law cites it", () => {
    const tree = {
      kind: "doc",
      address: "",
      children: [
        node("article", "2", { label: "第2条", heading: "委託業務" }, [node("item", "2.1.2", { label: "二" })]),
        node("article", "4", { label: "第4条", heading: "委託料と支払" }, [node("item", "4.2", { label: "２" })]),
      ],
    };
    expect(Object.fromEntries(placeNamesIn(tree))).toEqual({ "2": "第2条", "2.1.2": "第2条第二号", "4": "第4条", "4.2": "第4条第2項" });
  });

  it("numbers a paragraph chaff leaves unlabelled from its address, and an item under a paragraph after it", () => {
    const tree = {
      kind: "doc",
      address: "",
      children: [
        node("article", "20", { label: "第二十条", heading: "解雇の予告" }, [node("item", "20.2", { label: "" }, [node("item", "20.2.3", { label: "三" })])]),
        node("article", "21", { label: "第二十一条の二" }, [node("item", "21.1.4", { label: "四" })]),
      ],
    };
    expect(Object.fromEntries(placeNamesIn(tree))).toEqual({
      "20": "第二十条",
      "20.2": "第二十条第2項",
      "20.2.3": "第二十条第2項第三号",
      "21": "第二十一条の二",
      "21.1.4": "第二十一条の二第四号",
    });
  });

  it("keeps the plain naming under a part that is not a Japanese article", () => {
    const tree = { kind: "doc", address: "", children: [node("article", "3", { label: "Article 3" }, [node("item", "3.2", { label: "２" })])] };
    expect(placeNamesIn(tree).get("3.2")).toBe("Article 3 ２");
  });

  it("names an English contract's section by its label, however deep the items below it go", () => {
    const tree = node("doc", "", {}, [
      node("article", "3", { label: "Article III", heading: "FEES" }, [
        node("article", "3.2", { label: "Section 3.2", heading: "Payment" }, [
          node("item", "3.2.a", { label: "(a)" }, [node("item", "3.2.a.i", { label: "(i)" })]),
        ]),
      ]),
    ]);
    expect(Object.fromEntries(placeNamesIn(tree))).toEqual({
      "3": "Article III",
      "3.2": "Section 3.2",
      "3.2.a": "Section 3.2 (a)",
      "3.2.a.i": "Section 3.2 (a) (i)",
    });
  });

  it("names a Markdown section by its quoted heading, and falls back to the address with neither", () => {
    const tree = node("doc", "", {}, [
      node("section", "h1", { heading: "案内" }, [node("section", "h1.1", { heading: "用意するもの" }), node("section", "h1.2", {})]),
      node("item", "x.1", {}),
    ]);
    expect(Object.fromEntries(placeNamesIn(tree))).toEqual({ h1: "「案内」", "h1.1": "「用意するもの」", "h1.2": "h1.2", "x.1": "x.1" });
    expect([...placeNamesIn(null)]).toEqual([]);
  });
});

describe("placeNamer", () => {
  it("reads no tree for a file that is not one of the documents, and shows the address as it is", () => {
    const refused = placeNamer(() => ({ problem: "not one of the documents" }));
    expect(refused("other.md", "h1")).toBe("h1");
  });
});
