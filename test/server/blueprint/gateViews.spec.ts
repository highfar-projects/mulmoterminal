// @vitest-environment node
// The readable views a document gate asks the person to read: label-free, so they read the same whatever the
// documents' language, and plain text, so words quoted from a document are shown and never rendered.
import { describe, it, expect } from "vitest";
import { factsText } from "../../../blueprints/verify/checks/factsView.mjs";
import { findingsText } from "../../../blueprints/review/checks/findingsView.mjs";

const cite = (quote: string, address = "h1") => ({ source: "trip.md", address, quote });

describe("factsText", () => {
  it("puts events, amounts and totals a line each, with where each was read, the kinds apart", () => {
    const text = factsText({
      events: [
        { id: "a", date: "2026-10-01", weekday: "金", start: "09:00", end: "11:30", title: "東京から大阪", citation: cite("q") },
        { id: "b", date: "2026-10-02", title: "終日自由", citation: cite("q", "h2") },
      ],
      amounts: [
        { id: "hotel", label: "宿泊費", value: 24000, unit: "円", citation: cite("q", "h3") },
        { id: "train", label: "交通費", value: 1234567, unit: "円", citation: cite("q", "h3") },
      ],
      totals: [{ id: "total", label: "合計", value: 35000, unit: "円", parts: ["hotel", "train", "gone"], citation: cite("q", "h3") }],
    });
    expect(text).toBe(
      [
        "- 2026-10-01（金） 09:00–11:30 東京から大阪 · trip.md h1",
        "- 2026-10-02 終日自由 · trip.md h2",
        "",
        "---",
        "",
        "- 宿泊費 24,000 円 · trip.md h3",
        "- 交通費 1,234,567 円 · trip.md h3",
        "",
        "---",
        "",
        "- 合計 35,000 円 = 宿泊費 + 交通費 + gone · trip.md h3",
        "",
      ].join("\n"),
    );
  });

  it.each([["金"], ["（金）"], ["(金)"]])("takes the weekday %s with or without its brackets, and a start time alone", (weekday) => {
    expect(factsText({ events: [{ id: "a", date: "2026-10-01", weekday, start: "09:00", title: "発", citation: cite("q") }] })).toBe(
      "- 2026-10-01（金） 09:00 発 · trip.md h1\n",
    );
  });

  it("keeps a one-line field on one line, whatever newlines a document gave it", () => {
    const text = factsText({ amounts: [{ id: "x", label: "宿泊費 \n\n  （2泊）", value: -1.5, unit: "円", citation: cite("q", "h\n3") }] });
    expect(text).toBe("- 宿泊費 （2泊） -1.5 円 · trip.md h 3\n");
  });

  it("leaves out a kind with nothing in it", () => {
    expect(factsText({ amounts: [{ id: "x", label: "x", value: 1, unit: "USD", citation: cite("q") }] })).toBe("- x 1 USD · trip.md h1\n");
    expect(factsText({})).toBe("\n");
  });
});

describe("findingsText", () => {
  const base = {
    summary: "期限が二か所で違う",
    severity: "high",
    explanation: "第4条と第6条で違う。",
    citations: [{ source: "c.txt", address: "4.2", quote: "月末までに\n支払う" }],
  };

  it("gives each finding its summary and weight, explanation, quotes with their places and its proposal", () => {
    expect(findingsText({ findings: [{ ...base, proposal: "第6条を削る" }] })).toBe(
      "期限が二か所で違う\n●●●\n\n第4条と第6条で違う。\n\n> 月末までに\n> 支払う\n> — c.txt 4.2\n\n→ 第6条を削る\n",
    );
  });

  it("marks each weight, leaves an unknown one as written, and leaves out an empty proposal", () => {
    const marks = ["high", "medium", "low", "odd"].map((severity) => findingsText({ findings: [{ ...base, severity }] }).split("\n")[1]);
    expect(marks).toEqual(["●●●", "●●○", "●○○", "odd"]);
    expect(findingsText({ findings: [{ ...base, proposal: " " }] })).not.toContain("→");
  });

  it("indents a proposal's and a reason's later lines under their first, so a document's newline cannot pass for the layout", () => {
    const text = findingsText({
      findings: [{ ...base, proposal: "第6条を削る\n---\n# 見出しではない" }],
      dismissed: [{ rule: "dangling-reference", file: "c.txt", line: 19, why: "別の契約の条\n→ これも理由の続き" }],
    });
    expect(text).toContain("→ 第6条を削る\n  ---\n  # 見出しではない");
    expect(text.endsWith("---\n\n× c.txt:19 dangling-reference — 別の契約の条\n  → これも理由の続き\n")).toBe(true);
  });

  it("keeps markup from a document as the characters it is", () => {
    const text = findingsText({ findings: [{ ...base, summary: '![x](https://e.example/p) <img src="https://e.example/p">' }] });
    expect(text.startsWith('![x](https://e.example/p) <img src="https://e.example/p">\n')).toBe(true);
    expect(findingsText({ findings: [] })).toBe("\n");
  });
});
