// @vitest-environment node
// The readable views a document gate asks the person to read: label-free, so they read the same whatever the
// documents' language — the findings' and facts' own words, figures, quotes and places.
import { describe, it, expect } from "vitest";
import { factsMarkdown } from "../../../blueprints/verify/checks/factsView.mjs";
import { findingsMarkdown } from "../../../blueprints/review/checks/findingsView.mjs";

const cite = (quote: string, address = "h1") => ({ source: "trip.md", address, quote });

describe("factsMarkdown", () => {
  it("puts events, amounts and totals a line each, with where each was read, the kinds apart", () => {
    const markdown = factsMarkdown({
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
    expect(markdown).toBe(
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

  it("takes a weekday with or without its brackets, and a start time alone", () => {
    for (const weekday of ["金", "（金）", "(金)"]) {
      expect(factsMarkdown({ events: [{ id: "a", date: "2026-10-01", weekday, start: "09:00", title: "発", citation: cite("q") }] })).toBe(
        "- 2026-10-01（金） 09:00 発 · trip.md h1\n",
      );
    }
  });

  it("leaves out a kind with nothing in it", () => {
    expect(factsMarkdown({ amounts: [{ id: "x", label: "x", value: 1, unit: "USD", citation: cite("q") }] })).toBe("- x 1 USD · trip.md h1\n");
    expect(factsMarkdown({})).toBe("\n");
  });
});

describe("findingsMarkdown", () => {
  const base = {
    summary: "期限が二か所で違う",
    severity: "high",
    explanation: "第4条と第6条で違う。",
    citations: [{ source: "c.txt", address: "4.2", quote: "月末までに\n支払う" }],
  };

  it("gives each finding its summary, weight, explanation, quotes with their places and its proposal", () => {
    expect(findingsMarkdown({ findings: [{ ...base, proposal: "第6条を削る" }] })).toBe(
      ["### 期限が二か所で違う", "●●●", "第4条と第6条で違う。", "> 月末までに\n> 支払う\n> — c.txt 4.2", "→ 第6条を削る", ""]
        .join("\n\n")
        .replace(/\n\n$/u, "\n"),
    );
  });

  it("marks each weight, leaves an unknown one as written, and leaves out an empty proposal", () => {
    const marks = ["high", "medium", "low", "odd"].map((severity) => findingsMarkdown({ findings: [{ ...base, severity, proposal: " " }] }).split("\n\n")[1]);
    expect(marks).toEqual(["●●●", "●●○", "●○○", "odd"]);
    expect(findingsMarkdown({ findings: [{ ...base, proposal: " " }] })).not.toContain("→");
  });

  it("lists the machine findings set aside, with why, after the findings", () => {
    const markdown = findingsMarkdown({ findings: [base], dismissed: [{ rule: "dangling-reference", file: "c.txt", line: 19, why: "別の契約の条" }] });
    expect(markdown.endsWith("---\n\n- ~~c.txt:19 dangling-reference~~ 別の契約の条\n")).toBe(true);
    expect(findingsMarkdown({ findings: [] })).toBe("\n");
  });
});
