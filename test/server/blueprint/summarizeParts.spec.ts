// @vitest-environment node
// What a summary answers for and may not invent: the parts it may not drop silently, and the numbers it may only
// copy from the quotations backing each sentence.
import { describe, expect, it } from "vitest";
import { numbersIn, partsIn, summaryProblems, within } from "../../../blueprints/summarize/checks/parts.mjs";

const section = (address: string, heading: string, children: unknown[] = []) => ({ kind: "section", address, attrs: { heading }, children });
const MANUAL = {
  kind: "doc",
  address: "",
  children: [section("h1", "手引き", [section("h1.1", "対象", [section("h1.1.1", "細目")]), section("h1.2", "申請"), section("h1.3", "支払い")])],
};

describe("the parts of a document", () => {
  it("are the sections under a single title heading", () => {
    expect(partsIn(MANUAL)).toEqual([
      { address: "h1.1", name: "対象" },
      { address: "h1.2", name: "申請" },
      { address: "h1.3", name: "支払い" },
    ]);
  });

  it("are the top sections when there are several, and the articles whenever there are any", () => {
    const flat = { kind: "doc", address: "", children: [section("h1", "一"), section("h2", "二")] };
    expect(partsIn(flat).map((part) => part.address)).toEqual(["h1", "h2"]);
    const law = {
      kind: "doc",
      address: "",
      children: [
        section("h1", "章", [
          { kind: "article", address: "1", attrs: { label: "第1条" }, children: [] },
          { kind: "article", address: "2", attrs: { label: "第2条" } },
        ]),
      ],
    };
    expect(partsIn(law)).toEqual([
      { address: "1", name: "第1条" },
      { address: "2", name: "第2条" },
    ]);
  });

  it("are the one title section when nothing is under it, and none for no tree", () => {
    expect(partsIn({ kind: "doc", address: "", children: [section("h1", "だけ")] })).toEqual([{ address: "h1", name: "だけ" }]);
    expect(partsIn(null)).toEqual([]);
  });

  it("hold what is numbered under them, and nothing that only starts the same", () => {
    expect(within("h1.1", "h1.1")).toBe(true);
    expect(within("h1.1.1", "h1.1")).toBe(true);
    expect(within("h1.10", "h1.1")).toBe(false);
    expect(within("4.2", "4")).toBe(true);
    expect(within("42", "4")).toBe(false);
  });
});

describe("the numbers in a sentence", () => {
  it("are read whatever their width or separators", () => {
    expect(numbersIn("毎月25日、20,000円、２０，０００円、1.5倍、3.0%")).toEqual(["25", "20000", "20000", "1.5", "3"]);
    expect(numbersIn("締め切りは25. 金額は3,000.00円、版は1.2.3。")).toEqual(["25", "3000", "1.2.3"]);
    expect(numbersIn("数字なし")).toEqual([]);
    expect(numbersIn(undefined)).toEqual([]);
  });
});

const PARTS = [
  {
    source: "m.md",
    parts: [
      { address: "h1.1", name: "対象" },
      { address: "h1.2", name: "申請" },
      { address: "h1.3", name: "支払い" },
    ],
  },
];
const cite = (address: string, quote: string) => ({ source: "m.md", address, quote });
const GOOD = {
  sentences: [
    { text: "交通費と宿泊費が対象になる。", citations: [cite("h1.1", "交通費、宿泊費")] },
    { text: "使った日から30日以内に申請し、毎月25日に振り込まれる。", citations: [cite("h1.2", "30日以内に申請します"), cite("h1.3", "毎月25日にまとめて")] },
  ],
  omitted: [],
};
const NAMES: Record<string, string> = { "4": "第4条" };
const nameOf = (_source: unknown, address: unknown) => NAMES[String(address)];
const problemsOf = (summary: unknown, max: number | null = 5) => summaryProblems(summary, PARTS, max, nameOf);

describe("a summary", () => {
  it("passes when every sentence is quoted, every part cited, and every number copied", () => {
    expect(problemsOf(GOOD)).toEqual([]);
  });

  it("may leave a part out with a reason, and name a place's number from the place it cites", () => {
    const sentences = [GOOD.sentences[0], { text: "第4条に従い、30日以内に申請する。", citations: [cite("4", "30日以内に申請します"), cite("h1.2", "申請")] }];
    expect(problemsOf({ sentences, omitted: [{ source: "m.md", address: "h1.3", why: "読み手に要らない" }] })).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["no sentences", { sentences: [] }, 'needs a non-empty "sentences" list'],
    ["a sentence with no text", { sentences: [{ text: " ", citations: [cite("h1.1", "x")] }] }, 'sentence 1 needs "text"'],
    ["a sentence with no quotation", { sentences: [{ text: "a", citations: [] }] }, "sentence 1 needs at least one quotation"],
    [
      "a number no quotation says",
      { ...GOOD, sentences: [GOOD.sentences[0], { ...GOOD.sentences[1], text: "40日以内に申請し、毎月25日に振り込まれる。" }] },
      "sentence 2 states 40, which no quotation backing it says",
    ],
    ["a part neither cited nor left out", { sentences: GOOD.sentences.slice(0, 1) }, 'm.md 申請: no sentence cites it, and it is not in "omitted"'],
    [
      "a part left out without a reason",
      {
        sentences: GOOD.sentences.slice(0, 1),
        omitted: [
          { source: "m.md", address: "h1.2", why: "理由" },
          { source: "m.md", address: "h1.3" },
        ],
      },
      'm.md 支払い: left out without a reason in "why"',
    ],
    ["a part both cited and left out", { ...GOOD, omitted: [{ source: "m.md", address: "h1.1", why: "x" }] }, "m.md 対象: both cited and left out"],
    [
      "a part left out that is not a part",
      { ...GOOD, omitted: [{ source: "m.md", address: "h9", why: "x" }] },
      '"omitted" names m.md h9, which is not a part of it',
    ],
  ])("refuses %s", (_label, summary, message) => {
    expect(problemsOf(summary).join("\n")).toContain(message);
  });

  it("keeps to the agreed length, and has none for the longest", () => {
    expect(problemsOf(GOOD, 1)).toContain("2 sentences, more than the 1 agreed");
    expect(problemsOf(GOOD, null)).toEqual([]);
  });

  it("counts a quotation under a part as citing it", () => {
    const deep = { sentences: [{ text: "細目がある。", citations: [cite("h1.1.1", "細目")] }, GOOD.sentences[1]] };
    expect(problemsOf(deep)).toEqual([]);
  });
});
