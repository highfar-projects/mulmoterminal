// @vitest-environment node
// A glossary gathered from documents: every term the documents define is in it with that definition, every spelling
// is quoted where it was found, and a term spelled more than one way names the one to use.
import { describe, expect, it } from "vitest";
import {
  avoidedSpellings,
  citationsOf,
  definedTermsIn,
  definedTwice,
  glossaryProblems,
  jargonListed,
  jargonOf,
  writesOnItsOwn,
} from "../../../blueprints/glossary/checks/terms.mjs";

const cite = (source: string, address: string, quote: string) => ({ source, address, quote });
const SHAIN = {
  term: "社員",
  definitions: [
    cite("kitei.txt", "2", "「社員」とは、会社と雇用契約を結んでいる者をいう"),
    cite("tebiki.md", "h1.1", "「社員」とは、正社員と契約社員をいいます"),
  ],
  spellings: [{ spelling: "社員", citations: [cite("kitei.txt", "3", "社員は、テレワークをする日")] }],
};
const SERVER = {
  term: "サーバー",
  spellings: [
    { spelling: "サーバー", citations: [cite("tebiki.md", "h1.2", "会社のサーバーに接続")] },
    { spelling: "サーバ", citations: [cite("kitei.txt", "4", "VPN を通してサーバに接続")] },
  ],
  preferred: "サーバー",
};
const TELEWORK = {
  term: "テレワーク",
  definitions: [cite("kitei.txt", "2.2", "「テレワーク」とは、会社の外で")],
  spellings: [{ spelling: "テレワーク", citations: [cite("kitei.txt", "1", "テレワークで働く")] }],
};
const JARGON = { term: "横展開", jargon: true, spellings: [{ spelling: "横展開", citations: [cite("tebiki.md", "h1.3", "横展開する")] }] };
const GOOD = { terms: [SHAIN, SERVER, TELEWORK, JARGON] };
const DEFINED = [
  { source: "kitei.txt", terms: ["社員", "テレワーク"] },
  { source: "tebiki.md", terms: ["社員"] },
];

describe("the terms chaff reads as defined", () => {
  it("are the definition nodes' terms, each once", () => {
    const tree = {
      kind: "doc",
      children: [
        { kind: "definition", attrs: { term: "甲" } },
        {
          kind: "article",
          children: [
            { kind: "definition", attrs: { term: "甲" } },
            { kind: "definition", attrs: { term: "乙" } },
          ],
        },
      ],
    };
    expect(definedTermsIn(tree)).toEqual(["甲", "乙"]);
    expect(definedTermsIn(null)).toEqual([]);
  });
});

describe("a glossary", () => {
  it("passes when it gives every defined term, quotes every spelling, and names the spelling to use", () => {
    expect(glossaryProblems(GOOD, DEFINED)).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["no terms", { terms: [] }, 'needs a non-empty "terms" list'],
    ["a term listed twice", { terms: [...GOOD.terms, SERVER] }, "サーバー: listed twice"],
    [
      "a definition that does not contain its term",
      { terms: [{ ...SHAIN, definitions: [cite("kitei.txt", "2", "会社と雇用契約を結んでいる者"), SHAIN.definitions[1]] }, SERVER, TELEWORK] },
      "社員: the definition quoted from kitei.txt does not contain the term",
    ],
    [
      "a spelling whose quotation does not contain it",
      {
        terms: [
          SHAIN,
          { ...SERVER, spellings: [SERVER.spellings[0], { spelling: "サーバ", citations: [cite("kitei.txt", "4", "VPN を通して接続")] }] },
          TELEWORK,
        ],
      },
      "サーバー: a quotation for 「サーバ」 does not contain it",
    ],
    [
      "a term spelled two ways with no spelling to use",
      { terms: [SHAIN, { ...SERVER, preferred: undefined }, TELEWORK] },
      'サーバー: spelled 2 ways; "preferred" must be one of them',
    ],
    ["a spelling to use that was not found", { terms: [SHAIN, { ...SERVER, preferred: "サーヴァー" }, TELEWORK] }, '"preferred" is not one of its spellings'],
    ["a term with no spelling", { terms: [SHAIN, { term: "x", spellings: [] }, SERVER, TELEWORK] }, "x: list at least one spelling"],
    ["a defined term left out", { terms: [SHAIN, SERVER] }, "kitei.txt defines 「テレワーク」, which the glossary does not give with its definition there"],
    [
      "a term defined in two documents given with one definition",
      { terms: [{ ...SHAIN, definitions: [SHAIN.definitions[0]] }, SERVER, TELEWORK] },
      "tebiki.md defines 「社員」",
    ],
  ])("refuses %s", (_label, glossary, message) => {
    expect(glossaryProblems(glossary, DEFINED).join("\n")).toContain(message);
  });

  it("counts a definition under one of the term's spellings", () => {
    const spelled = {
      terms: [
        SHAIN,
        SERVER,
        {
          ...TELEWORK,
          term: "在宅勤務",
          preferred: "在宅勤務",
          spellings: [...TELEWORK.spellings, { spelling: "在宅勤務", citations: [cite("tebiki.md", "h1.1", "在宅勤務")] }],
        },
      ],
    };
    expect(glossaryProblems(spelled, DEFINED)).toEqual([]);
  });
});

describe("what the glossary gives chaff and the report", () => {
  it("lists every quotation, the terms defined twice, the spellings to avoid, and the jargon", () => {
    expect(citationsOf(GOOD)).toHaveLength(8);
    expect(definedTwice(GOOD)).toEqual(["社員"]);
    expect(avoidedSpellings(GOOD)).toEqual([{ avoided: "サーバ", preferred: "サーバー" }]);
    expect(jargonOf(GOOD)).toEqual(["横展開"]);
    expect(avoidedSpellings(undefined)).toEqual([]);
  });
});

describe("two terms that would replace one spelling", () => {
  it("are refused, since chaff.yaml maps a spelling one way only", () => {
    const user = {
      term: "ユーザ名",
      spellings: [
        { spelling: "ユーザ名", citations: [cite("tebiki.md", "h1.3", "ユーザ名を忘れた")] },
        { spelling: "サーバ", citations: [cite("kitei.txt", "4", "サーバに接続")] },
      ],
      preferred: "ユーザ名",
    };
    expect(glossaryProblems({ terms: [SHAIN, SERVER, TELEWORK, user] }, DEFINED)).toContain(
      "「サーバ」 would be replaced by different spellings in different terms: give it one",
    );
  });
});

describe("a document still writing an avoided spelling", () => {
  it("counts it on its own, not inside the preferred one", () => {
    expect(writesOnItsOwn("ユーザーでログインする", { avoided: "ユーザ", preferred: "ユーザー" })).toBe(false);
    expect(writesOnItsOwn("ユーザーとユーザ", { avoided: "ユーザ", preferred: "ユーザー" })).toBe(true);
  });

  it("counts an avoided spelling that contains the preferred one", () => {
    expect(writesOnItsOwn("サーバーにつなぐ", { avoided: "サーバー", preferred: "サーバ" })).toBe(true);
    expect(writesOnItsOwn("サーバにつなぐ", { avoided: "サーバー", preferred: "サーバ" })).toBe(false);
  });
});

describe("chaff.yaml's jargon list", () => {
  it("is read as a block or inline, and nothing else in the file counts", () => {
    expect(jargonListed("language: ja\njargon:\n  - 横展開 # 社内\n  - '握る'\nrules:\n  x: normal\n")).toEqual(["横展開", "握る"]);
    expect(jargonListed('jargon: [横展開, "巻き取り"]\n')).toEqual(["横展開", "巻き取り"]);
    expect(jargonListed("# jargon: 横展開\nprefer:\n  横展開: 展開\n")).toEqual([]);
    expect(jargonListed("")).toEqual([]);
    expect(jargonListed("jargon:\n  # 社内だけで通じる言葉\n  - 横展開\n  note: 巻き取り\n")).toEqual(["横展開"]);
  });
});
