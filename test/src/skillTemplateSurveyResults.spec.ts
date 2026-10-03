// @vitest-environment jsdom
//
// The survey-results template's pages, RUN. What the public page owns: `tallies` before `responses`,
// one write per press, a tally that carries the chosen answers and nothing else (it is
// world-readable), results only after this visitor answered, and counting only declared questions
// and choices — `tallies.answers` is free text anyone can write, so nothing else read from it may
// reach the screen.
import { describe, it, expect } from "vitest";

import surveyResultsTemplate from "../../server/skills/mulmoterminal-shared-app/templates/survey-results.md?raw";

type Outcome = { ok: true } | { ok: false; error: string };
type Mine = (cid: string, key: string) => Promise<{ known: boolean; found: boolean }>;
interface Call {
  cid: string;
  values: Record<string, string>;
}

function pageOf(heading: string): string {
  const lines = surveyResultsTemplate.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  expect(`${heading}: ${start === -1 ? "no section" : "has a section"}`).toBe(`${heading}: has a section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
  const open = body.indexOf("```html\n") + "```html\n".length;
  return body.slice(open, body.indexOf("\n```", open));
}

function load(heading: string, mine?: Mine) {
  const html = pageOf(heading);
  const scriptStart = html.indexOf("<script>\n") + "<script>\n".length;
  const script = html.slice(scriptStart, html.indexOf("\n</script>", scriptStart));
  document.body.innerHTML = html.slice(0, html.indexOf("<script>"));
  const calls: Call[] = [];
  const outcomes: Outcome[] = [];
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: (cid: string, values: Record<string, string>) => {
      calls.push({ cid, values });
      return Promise.resolve(outcomes.shift() ?? { ok: true });
    },
    ...(mine ? { mine } : {}),
    ready: () => {},
  };
  // Run rather than insert: jsdom does not execute <script> elements.
  new Function(script)();
  return {
    calls,
    next: (outcome: Outcome) => outcomes.push(outcome),
    tell: (data: Record<string, unknown[]>, viewer: Record<string, unknown> = {}) => onState?.(data, viewer),
    said: () => document.getElementById("say")?.textContent ?? "",
  };
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 32; turn += 1) {
    await Promise.resolve();
  }
};

const click = (selector: string): void => {
  const target = document.querySelector<HTMLElement>(selector);
  expect(`${selector}: ${target === null ? "missing" : "present"}`).toBe(`${selector}: present`);
  target?.click();
};

const pick = (questionId: string, choice: string): void => {
  const radio = [...document.querySelectorAll<HTMLInputElement>("#list input[type=radio]")].find(
    (input) => input.dataset.question === questionId && input.value === choice,
  );
  expect(`${questionId}=${choice}: ${radio === undefined ? "missing" : "present"}`).toBe(`${questionId}=${choice}: present`);
  if (radio) radio.checked = true;
};

const QUESTIONS = [
  { id: "q2", order: 2, text: "また来ますか", choices: "はい\nいいえ" },
  { id: "q1", order: 1, text: "満足度", choices: "良い\n普通\n悪い" },
];
const tallyOf = (answers: Record<string, string>) => ({ answers: JSON.stringify(answers) });
const notAnswered = { mine: { tallies: [], responses: [] } };
const answered = { mine: { tallies: [{ id: "me" }], responses: [{ id: "me" }] } };
const isHidden = (id: string): boolean => (document.getElementById(id)?.hidden ?? true) !== false;
const resultText = (): string => document.getElementById("result")?.textContent ?? "";

const answerBoth = async (page: ReturnType<typeof load>): Promise<void> => {
  page.tell({ questions: QUESTIONS, tallies: [] }, notAnswered);
  pick("q1", "良い");
  pick("q2", "はい");
  click("#send");
  await settle();
};

describe("survey-results.md — views/survey.html", () => {
  it("sends tallies first, with the chosen answers and nothing else", async () => {
    const page = load("views/survey.html");
    (document.getElementById("who") as HTMLInputElement).value = "ゆき";
    (document.getElementById("comment") as HTMLTextAreaElement).value = "よかった";
    await answerBoth(page);
    expect(page.calls).toEqual([{ cid: "tallies", values: { answers: JSON.stringify({ q1: "良い", q2: "はい" }) } }]);
  });

  it("sends the name and comment as a SECOND press, to responses", async () => {
    const page = load("views/survey.html");
    await answerBoth(page);
    expect(isHidden("finish")).toBe(false);
    (document.getElementById("who") as HTMLInputElement).value = "ゆき";
    (document.getElementById("comment") as HTMLTextAreaElement).value = "よかった";
    click("#send-response");
    await settle();
    expect(page.calls.map((call) => call.cid)).toEqual(["tallies", "responses"]);
    expect(page.calls[1]?.values).toEqual({ name: "ゆき", comment: "よかった" });
    expect(isHidden("finish")).toBe(true);
  });

  it("re-sends only responses when responses fails", async () => {
    const page = load("views/survey.html");
    await answerBoth(page);
    page.next({ ok: false, error: "unavailable" });
    click("#send-response");
    await settle();
    expect(page.said()).toContain("unavailable");
    expect(isHidden("finish")).toBe(false);
    click("#send-response");
    await settle();
    click("#send");
    await settle();
    expect(page.calls.map((call) => call.cid)).toEqual(["tallies", "responses", "responses"]);
  });

  it("refuses to send until every question is chosen", async () => {
    const page = load("views/survey.html");
    page.tell({ questions: QUESTIONS, tallies: [] }, notAnswered);
    pick("q1", "良い");
    click("#send");
    await settle();
    expect(page.calls).toEqual([]);
    expect(page.said()).toContain("1 問");
  });

  it("shows no result before this visitor answered", () => {
    load("views/survey.html").tell({ questions: QUESTIONS, tallies: [tallyOf({ q1: "良い", q2: "はい" })] }, notAnswered);
    expect(isHidden("result")).toBe(true);
    expect(isHidden("ask")).toBe(false);
  });

  it("counts per question and per choice, with shares over that question's answers", () => {
    const page = load("views/survey.html");
    page.tell(
      {
        questions: QUESTIONS,
        tallies: [tallyOf({ q1: "良い", q2: "はい" }), tallyOf({ q1: "良い", q2: "いいえ" }), tallyOf({ q1: "悪い", q2: "はい" })],
      },
      answered,
    );
    expect(isHidden("result")).toBe(false);
    const questions = [...document.querySelectorAll("#bars .question")].map((box) => box.textContent ?? "");
    expect(questions).toEqual(["満足度良い2（67%）普通0（0%）悪い1（33%）", "また来ますかはい2（67%）いいえ1（33%）"]);
    expect(document.getElementById("total")?.textContent).toBe("3 件の回答");
  });

  it("counts only declared questions and choices, and never draws an undeclared string", () => {
    const page = load("views/survey.html");
    page.tell(
      {
        questions: QUESTIONS,
        tallies: [
          tallyOf({ q1: "良い", q2: "はい" }),
          tallyOf({ q1: "<b>宣伝です</b>", q2: "はい", 見知らぬ設問: "広告" }),
          { answers: "{not json 怪しい文字列" },
          { answers: JSON.stringify(["配列の中身"]) },
        ],
      },
      answered,
    );
    const text = resultText();
    expect(text).toContain("4 件の回答");
    expect(text).toContain("2 件は読めない形式");
    expect(text).toContain("良い1（100%）");
    expect(text).toContain("はい2（100%）");
    ["宣伝です", "見知らぬ設問", "広告", "怪しい文字列", "配列の中身"].forEach((planted) => expect(document.body.textContent).not.toContain(planted));
    expect(document.querySelector("#result b")).toBeNull();
  });

  it("shows the result at once after this visitor's own answer is accepted", async () => {
    const page = load("views/survey.html");
    page.tell({ questions: QUESTIONS, tallies: [tallyOf({ q1: "悪い", q2: "いいえ" })] }, notAnswered);
    pick("q1", "良い");
    pick("q2", "はい");
    click("#send");
    await settle();
    expect(isHidden("ask")).toBe(true);
    expect(resultText()).toContain("2 件の回答");
    expect(resultText()).toContain("良い1（50%）");
  });

  it("asks whether this visitor answered before they press, when the parent did not say", async () => {
    const asked: string[] = [];
    const mine: Mine = (cid) => {
      asked.push(cid);
      return Promise.resolve({ known: true, found: cid === "tallies" });
    };
    const page = load("views/survey.html", mine);
    page.tell({ questions: QUESTIONS, tallies: [] });
    expect(isHidden("ask")).toBe(true);
    expect(isHidden("checking")).toBe(false);
    await settle();
    expect(asked.sort()).toEqual(["responses", "tallies"]);
    expect(isHidden("ask")).toBe(true);
    expect(isHidden("finish")).toBe(false);
    expect(isHidden("result")).toBe(false);
  });

  it("offers the form, without claiming the visitor has not answered, when nobody could look", async () => {
    const page = load("views/survey.html", () => Promise.resolve({ known: false, found: false }));
    page.tell({ questions: QUESTIONS, tallies: [] });
    await settle();
    expect(isHidden("checking")).toBe(true);
    expect(isHidden("ask")).toBe(false);
    expect(isHidden("result")).toBe(true);
  });
});

describe("survey-results.md — views/desk.html", () => {
  it("joins each tally to its response by id, and keeps an answer with no name", () => {
    const page = load("views/desk.html");
    page.tell({
      questions: QUESTIONS,
      tallies: [
        { id: "u1", answers: JSON.stringify({ q1: "良い", q2: "はい" }) },
        { id: "u2", answers: JSON.stringify({ q1: "悪い", q2: "いいえ" }) },
      ],
      responses: [{ id: "u1", email: "yuki@example.jp", name: "ゆき", comment: "よかった", answeredAt: "2026-10-03T00:00:00Z" }],
    });
    const people = [...document.querySelectorAll("#people li")].map((item) => item.textContent ?? "");
    expect(people).toEqual(["ゆき（yuki@example.jp）満足度: 良いまた来ますか: はいよかった", "（名前・メールなし）満足度: 悪いまた来ますか: いいえ"]);
  });

  it("keeps a stored value nobody declares, marked as such", () => {
    const page = load("views/desk.html");
    page.tell({ questions: QUESTIONS, tallies: [{ id: "u1", answers: JSON.stringify({ q1: "最高", q9: "x" }) }], responses: [] });
    const text = document.getElementById("tally")?.textContent ?? "";
    expect(text).toContain("最高（宣言にない値）1（100%）");
    expect(text).toContain("q9（宣言にない設問 ID）");
  });
});
