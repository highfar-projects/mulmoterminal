// @vitest-environment node
// What each kind of document is read for beyond chaff's findings, and the record the polish step keeps of it. The
// record is the only proof the reading happened, so every rule here is one an agent could otherwise skip.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  quotedIn,
  readCatalog,
  sectionText,
  unreportedWriterItems,
  viewpointProblems,
  viewpointsFor,
  writerItems,
} from "../../../blueprints/polish/checks/viewpoints.mjs";
import { readKinds } from "../../../blueprints/polish/checks/kind.mjs";
import { PACKS } from "./docsPackHarness";

const catalog = readCatalog(join(PACKS, "polish"));
const kinds = readKinds(join(PACKS, "polish"));

describe("the viewpoint catalog", () => {
  it("covers only genres a kind can name, with viewpoints it defines, each used somewhere", () => {
    const genres = kinds.flatMap((kind) => (kind.genre === null ? [] : [kind.genre]));
    Object.keys(catalog.genres).forEach((genre) => expect(genres).toContain(genre));
    const used = new Set(Object.values(catalog.genres).flat());
    used.forEach((id) => expect(catalog.viewpoints).toHaveProperty(id));
    Object.keys(catalog.viewpoints).forEach((id) => expect(used).toContain(id));
  });

  it("gives every viewpoint a title, what to look for, and who may fix it", () => {
    Object.values(catalog.viewpoints).forEach((viewpoint) => {
      expect(viewpoint.title.trim()).not.toBe("");
      expect(viewpoint.look.trim()).not.toBe("");
      expect(["may", "writer"]).toContain(viewpoint.fix);
    });
  });

  it("reads a report and a blog for different things, and a manual for none yet", () => {
    expect(viewpointsFor(catalog, "business/report")).toContain("actionable-ask");
    expect(viewpointsFor(catalog, "blog/tech")).toContain("padded-intro");
    expect(viewpointsFor(catalog, "blog/tech")).not.toContain("actionable-ask");
    expect(viewpointsFor(catalog, "technical/readme")).toEqual([]);
    expect(viewpointsFor(catalog, null)).toEqual([]);
  });
});

const ORIGINAL = "# 報告\n\n9月は増えた。\n\n増加する可能性があると考えられます。\n\nご確認をお願いします。\n";
const CURRENT = "# 報告\n\n9月は増えた。\n\n増加すると考えられます。\n\nご確認をお願いします。\n";
const IDS = ["stacked-hedging", "actionable-ask", "conclusion-first"];
const GOOD = [
  { id: "stacked-hedging", verdict: "fixed", quote: "増加する可能性があると考えられます" },
  { id: "actionable-ask", verdict: "writer", quote: "ご確認をお願いします", note: "誰に、いつまでに？" },
  { id: "conclusion-first", verdict: "ok" },
];
const problemsOf = (entries: unknown, ids: readonly string[] = IDS) =>
  viewpointProblems({ file: "r.md", ids, catalog, entries, original: ORIGINAL, current: CURRENT });
const withEntry = (id: string, entry: Record<string, unknown>) => GOOD.map((good) => (good.id === id ? { id, ...entry } : good));

describe("the record of a polished file's viewpoints", () => {
  it("passes when every viewpoint is recorded once, each tied to the text", () => {
    expect(problemsOf(GOOD)).toEqual([]);
  });

  it("finds a quotation across a wrapped line", () => {
    expect(problemsOf(withEntry("actionable-ask", { verdict: "writer", quote: "ご確認を\nお願いします", note: "誰に？" }))).toEqual([]);
  });

  it("asks nothing of a kind with no viewpoints", () => {
    expect(problemsOf(undefined, [])).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["no record at all", undefined, "r.md: no viewpoints recorded"],
    ["a record that is not a list", { id: "x" }, "r.md: no viewpoints recorded"],
    ["a viewpoint left out", GOOD.slice(1), "r.md: stacked-hedging: not recorded"],
    ["a viewpoint twice", [...GOOD, GOOD[2]], "r.md: conclusion-first: recorded twice"],
    ["a viewpoint of another kind", [...GOOD, { id: "padded-intro", verdict: "ok" }], "r.md: padded-intro: not one of this kind's viewpoints"],
    ["an entry of the wrong shape", [...GOOD, "ok"], "r.md: an entry is not"],
    ["an unknown verdict", withEntry("conclusion-first", { verdict: "fine" }), "conclusion-first: verdict must be one of"],
    [
      "a fix the catalog leaves to the writer",
      withEntry("actionable-ask", { verdict: "fixed", quote: "ご確認をお願いします" }),
      "actionable-ask: this is the writer's to settle",
    ],
    ["a fix with no quotation", withEntry("stacked-hedging", { verdict: "fixed" }), "stacked-hedging: a fix needs the quotation"],
    [
      "a fix quoting what the original never said",
      withEntry("stacked-hedging", { verdict: "fixed", quote: "減少する" }),
      "the quotation is not in the original",
    ],
    [
      "a fix whose text is still there",
      withEntry("stacked-hedging", { verdict: "fixed", quote: "9月は増えた。" }),
      "still in the document, so nothing was fixed",
    ],
    ["a question with no quotation", withEntry("actionable-ask", { verdict: "writer", note: "誰に？" }), "needs the quotation it is about"],
    [
      "a question quoting what is not in the file",
      withEntry("actionable-ask", { verdict: "writer", quote: "至急", note: "誰に？" }),
      "actionable-ask: the quotation is not in the document",
    ],
    [
      "a question with no question",
      withEntry("actionable-ask", { verdict: "writer", quote: "ご確認をお願いします", note: " " }),
      'needs the question, in "note"',
    ],
    [
      "an ok quoting what is not in the file",
      withEntry("conclusion-first", { verdict: "ok", quote: "結論" }),
      "conclusion-first: the quotation is not in the document",
    ],
  ])("refuses %s", (_label, entries, message) => {
    expect(problemsOf(entries).join("\n")).toContain(message);
  });
});

describe("the questions for the writer in the report", () => {
  const record = { "r.md": GOOD, "s.md": [{ id: "actionable-ask", verdict: "writer", quote: "至急対応", note: "いつまで？" }], "t.md": "broken" };

  it("collects every writer verdict, by file, and nothing else", () => {
    expect(writerItems(record).map((item) => `${item.file} ${item.id}`)).toEqual(["r.md actionable-ask", "s.md actionable-ask"]);
    expect(writerItems(undefined)).toEqual([]);
  });

  it("names the questions the writer's part does not carry, by file and quotation, spacing aside", () => {
    const items = writerItems(record);
    expect(unreportedWriterItems(items, "- r.md 「ご確認を お願いします」\n")).toEqual(["s.md actionable-ask"]);
    expect(unreportedWriterItems(items, "- r.md ご確認をお願いします\n- s.md 至急対応")).toEqual([]);
    expect(unreportedWriterItems(items, "- ご確認をお願いします\n- 至急対応")).toEqual(["r.md actionable-ask", "s.md actionable-ask"]);
  });

  it("wants a quotation as many times as there are questions quoting it", () => {
    const twice = writerItems({
      "a.md": [
        { id: "actionable-ask", verdict: "writer", quote: "至急", note: "誰が？" },
        { id: "agentless-passive", verdict: "writer", quote: "至急", note: "いつ？" },
      ],
    });
    expect(unreportedWriterItems(twice, "- a.md 至急 誰が？")).toEqual(["a.md agentless-passive"]);
    expect(unreportedWriterItems(twice, "- a.md 至急 誰が？\n- a.md 至急 いつ？")).toEqual([]);
  });
});

describe("a quotation", () => {
  it("is found within a paragraph, across a wrapped line", () => {
    expect(quotedIn("ご確認を お願いします", "前の文。\nご確認を\nお願いします。")).toBe(true);
  });

  it("is not made of words from two paragraphs, nor one that spans a blank line", () => {
    expect(quotedIn("増えた。増加", ORIGINAL)).toBe(false);
    expect(quotedIn("9月は増えた。\n\n増加", ORIGINAL)).toBe(false);
  });

  it.each([
    ["", ORIGINAL],
    ["   ", ORIGINAL],
    [undefined, ORIGINAL],
    [3, ORIGINAL],
  ])("is nothing for %j", (quote, text) => {
    expect(quotedIn(quote, text)).toBe(false);
  });
});

describe("the writer's part of a report", () => {
  const REPORT = "# 報告\n\n## 整えたもの\nx\n\n## 書いた人に確かめてほしいこと\n- a\n### 小見出し\n- b\n\n## 直さずに残したもの\n- c\n";

  it("runs from its heading to the next section, keeping deeper headings", () => {
    expect(sectionText(REPORT, ["書いた人に確かめてほしいこと", "For the writer"])).toBe("- a\n### 小見出し\n- b\n");
    expect(sectionText("## For the writer\n- a", ["書いた人に確かめてほしいこと", "For the writer"])).toBe("- a");
  });

  it("is empty when the report has no such part", () => {
    expect(sectionText(REPORT, ["For the writer"])).toBe("");
  });
});
