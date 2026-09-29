// @vitest-environment node
// The ask pack's checks decide when a question was answered honestly from the documents: one reply per
// question, a reply found in the documents quotes them (chaff cite) and names what it quotes, a reply not
// found says what was searched, the documents never change, and FAQ.md is only ever added to. They run here
// for real against a stand-in chaff (see docsPackHarness).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("ask");
const { write, writeFake, node } = harness;

const KEEP = "このフォルダの FAQ.md に書き足す";
const DO_NOT_KEEP = "残さない（.blueprint の中だけ）";
const MANUAL = ["# 返品", "", "## 期限", "", "商品到着後14日以内に連絡してください。", ""].join("\n");
const Q_DEADLINE = "返品はいつまで？";
const Q_SHIPPING = "送料は誰が払う？";

type Reply = Record<string, unknown>;
const found = (overrides: Reply = {}): Reply => ({
  question: Q_DEADLINE,
  found: true,
  answer: "商品到着後14日以内です（返品 > 期限）。",
  citations: [{ source: "manual.md", address: "返品 > 期限", quote: "商品到着後14日以内" }],
  ...overrides,
});
const notFound = (overrides: Reply = {}): Reply => ({
  question: Q_SHIPPING,
  found: false,
  answer: "文書には書かれていません。",
  searched: ["送料", "配送料"],
  ...overrides,
});
const replies = (list: unknown[]) => write(".blueprint/replies.json", { replies: list });
const page = (text = `## ${Q_DEADLINE}\n\n14日以内\n\n## ${Q_SHIPPING}\n\n書かれていない\n`) => write(".blueprint/replies.md", text);
const answers = (keep = KEEP, documents = "manual.md", questions = `${Q_DEADLINE}\n${Q_SHIPPING}`) =>
  write(".blueprint/answers.json", { documents, questions, keep });

beforeEach(() => {
  harness.setUp();
  answers();
  write("manual.md", MANUAL);
  replies([found(), notFound()]);
  page();
});
afterEach(() => harness.tearDown());

describeSh("ask: replies.mjs answer", () => {
  it("passes with one reply per question, and checks every quotation with chaff cite", () => {
    expect(node("replies.mjs", ["answer"])).toEqual({ code: 0, stderr: "" });
    expect(readFileSync(join(harness.fake(), "cite.log"), "utf8")).toContain("商品到着後14日以内");
  });

  it("checks the quotations of a reply that was not found, too", () => {
    replies([found(), notFound({ citations: [{ source: "manual.md", address: "返品", quote: "x" }], answer: "書かれていません（返品）。" })]);
    writeFake("cite.json", { "manual.md": 1 });
    expect(node("replies.mjs", ["answer"]).stderr).toContain("are not in it");
  });

  it("matches a question however much space surrounds it", () => {
    answers(KEEP, "manual.md", `  ${Q_DEADLINE}  \n\n${Q_SHIPPING}\n`);
    replies([found({ question: `${Q_DEADLINE} ` }), notFound()]);
    expect(node("replies.mjs", ["answer"]).code).toBe(0);
  });

  // A Markdown section's address is chaff's index (h1.1): the answer may name the section by its heading instead.
  const TREE = {
    kind: "doc",
    address: "",
    children: [
      {
        kind: "section",
        address: "h1",
        attrs: { heading: "返品" },
        children: [{ kind: "section", address: "h1.1", attrs: { heading: "期限" }, children: [] }],
      },
    ],
  };
  const bySection = (answer: string, source = "manual.md") => found({ answer, citations: [{ source, address: "h1.1", quote: "商品到着後14日以内" }] });

  it("takes an answer that names a section by its heading rather than by chaff's index", () => {
    writeFake("tree.json", { "manual.md": TREE });
    replies([bySection("商品到着後14日以内です（「期限」）。"), notFound()]);
    expect(node("replies.mjs", ["answer"])).toEqual({ code: 0, stderr: "" });
    replies([bySection("商品到着後14日以内です（h1.1）。"), notFound()]);
    expect(node("replies.mjs", ["answer"]).code).toBe(0);
  });

  it("refuses an answer that names neither the section's index nor its heading", () => {
    writeFake("tree.json", { "manual.md": TREE });
    replies([bySection("商品到着後14日以内です（「返品」）。"), notFound()]);
    const result = node("replies.mjs", ["answer"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("does not name h1.1");
  });

  it("does not take a heading from a file that is not one of the documents", () => {
    writeFake("tree.json", { "manual.md": TREE, "other.md": TREE });
    write("other.md", MANUAL);
    replies([bySection("商品到着後14日以内です（「期限」）。", "other.md"), notFound()]);
    expect(node("replies.mjs", ["answer"]).stderr).toContain("does not name h1.1");
  });

  it.each<[string, () => void, string]>([
    ["a question with no reply", () => replies([found()]), `no reply to:\n  ${Q_SHIPPING}`],
    ["a reply to a question nobody asked", () => replies([found(), notFound(), notFound({ question: "他には？" })]), "questions nobody asked"],
    ["a question answered twice", () => replies([found(), notFound(), found()]), "answered twice"],
    ["a found reply with no quotation", () => replies([found({ citations: [] }), notFound()]), "quotes them"],
    ["a found reply with no citations at all", () => replies([found({ citations: undefined }), notFound()]), "quotes them"],
    ["an answer that does not name what it quotes", () => replies([found({ answer: "14日以内です。" }), notFound()]), "does not name 返品 > 期限"],
    [
      "a quotation with a blank address",
      () => replies([found({ citations: [{ source: "manual.md", address: " ", quote: "商品到着後14日以内" }] }), notFound()]),
      'needs an "address"',
    ],
    ["a reply not found that says nothing of what was searched", () => replies([found(), notFound({ searched: [] })]), '"searched"'],
    ["a reply not found whose searched list is blank", () => replies([found(), notFound({ searched: [" "] })]), '"searched"'],
    ["a reply without found", () => replies([found({ found: "yes" }), notFound()]), '"found" must be'],
    ["an empty answer", () => replies([found({ answer: " " }), notFound()]), "no answer"],
    ["a reply naming no question", () => replies([found({ question: "" }), notFound()]), "names no question"],
    ["a reply that is not an object", () => replies([null]), "not an object"],
    ["citations that are not a list", () => replies([found({ citations: "x" }), notFound()]), "must be an array"],
    [
      "a quotation from a file that is not a document",
      () => replies([found({ citations: [{ source: "other.md", address: "返品 > 期限", quote: "x" }] }), notFound()]),
      "not one of the documents",
    ],
    ["a quotation chaff cite does not find", () => writeFake("cite.json", { "manual.md": 1 }), "quotations from manual.md are not in it"],
    ["no replies list", () => write(".blueprint/replies.json", {}), 'needs a "replies" array'],
    ["no page for the person", () => write(".blueprint/replies.md", ""), "does not show"],
    ["a page missing a question", () => page(`## ${Q_DEADLINE}\n`), `does not show: ${Q_SHIPPING}`],
    ["no question in the interview", () => answers(KEEP, "manual.md", " \n"), "asks no question"],
    ["the same question twice", () => answers(KEEP, "manual.md", `${Q_DEADLINE}\n${Q_DEADLINE}`), "same question twice"],
    [
      "FAQ.md named as a document while keeping",
      () => {
        write("FAQ.md", "x");
        answers(KEEP, "manual.md\nFAQ.md");
      },
      "FAQ.md is one of the documents",
    ],
    ["a document that is not there", () => answers(KEEP, "missing.md"), "not a file in this folder: missing.md"],
    ["interview answers that are null", () => write(".blueprint/answers.json", "null"), "names no document"],
  ])("fails on %s", (_label, arrange, message) => {
    arrange();
    const result = node("replies.mjs", ["answer"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("fails when the page for the person is missing", () => {
    harness.tearDown();
    harness.setUp();
    answers();
    write("manual.md", MANUAL);
    replies([found(), notFound()]);
    expect(node("replies.mjs", ["answer"]).stderr).toContain("replies.md is missing");
  });
});

describeSh("ask: replies.mjs keep", () => {
  const answered = () => expect(node("replies.mjs", ["answer"]).code).toBe(0);
  const FAQ = `## ${Q_DEADLINE}\n\n14日以内（manual.md 返品 > 期限）\n\n## ${Q_SHIPPING}\n\n書かれていない\n`;

  it("passes when FAQ.md is created with every question", () => {
    answered();
    write("FAQ.md", FAQ);
    expect(node("replies.mjs", ["keep"])).toEqual({ code: 0, stderr: "" });
  });

  it("passes when an existing FAQ.md is added to", () => {
    write("FAQ.md", "# よくある質問\n\n");
    answered();
    write("FAQ.md", `# よくある質問\n\n${FAQ}`);
    expect(node("replies.mjs", ["keep"]).code).toBe(0);
  });

  it("passes when the person chose not to keep, and FAQ.md was left alone", () => {
    answers(DO_NOT_KEEP);
    write("FAQ.md", "# 既存\n");
    answered();
    expect(node("replies.mjs", ["keep"]).code).toBe(0);
  });

  it.each<[string, () => void, string]>([
    [
      "a document that changed",
      () => {
        write("manual.md", `${MANUAL}追記`);
        write("FAQ.md", FAQ);
      },
      "the documents must stay as they are: manual.md",
    ],
    ["no FAQ.md", () => undefined, "FAQ.md is missing"],
    ["a FAQ.md missing a question", () => write("FAQ.md", `## ${Q_DEADLINE}\n`), `does not hold: ${Q_SHIPPING}`],
  ])("fails on %s", (_label, arrange, message) => {
    answered();
    arrange();
    const result = node("replies.mjs", ["keep"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("fails when what FAQ.md held before was rewritten", () => {
    write("FAQ.md", "# よくある質問\n\n");
    answered();
    write("FAQ.md", `# FAQ\n\n${FAQ}`);
    expect(node("replies.mjs", ["keep"]).stderr).toContain("what it held before must stay as it was");
  });

  it("fails when the person chose not to keep and FAQ.md was written anyway", () => {
    answers(DO_NOT_KEEP);
    answered();
    write("FAQ.md", FAQ);
    expect(node("replies.mjs", ["keep"]).stderr).toContain("chose not to keep");
  });

  it("fails when the person chose not to keep and an existing FAQ.md was changed", () => {
    answers(DO_NOT_KEEP);
    write("FAQ.md", "# 既存\n");
    answered();
    write("FAQ.md", `# 既存\n${FAQ}`);
    expect(node("replies.mjs", ["keep"]).stderr).toContain("chose not to keep");
  });

  it("fails clearly when the record is not what the answer step writes", () => {
    answered();
    write(".blueprint/.replies-before.json", { documents: [] });
    expect(node("replies.mjs", ["keep"]).stderr).toContain("is not what the answer step records");
  });

  it("fails when the documents named now are not the ones that were read", () => {
    write("terms.md", "x");
    answers(KEEP, "manual.md\nterms.md");
    answered();
    answers(KEEP, "manual.md");
    write("FAQ.md", FAQ);
    expect(node("replies.mjs", ["keep"]).stderr).toContain("not the ones that were read");
  });

  it("fails when the answer step never recorded anything", () => {
    write("FAQ.md", FAQ);
    expect(node("replies.mjs", ["keep"]).stderr).toContain(".replies-before.json is missing");
  });

  it("refuses an unknown mode", () => {
    expect(node("replies.mjs", ["check"]).stderr).toContain("usage: replies.mjs answer | keep");
  });
});
