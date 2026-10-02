// @vitest-environment jsdom
//
// The question box's two pages, RUN. The rules decide what a visitor may read; what the pages own is
// sending only the question (the parent adds status and the stamp, and the publish flag is never the
// sender's), drawing what arrives, and the desk writing an answer through the two calls it may use.
import { describe, it, expect } from "vitest";

import questionBox from "../../server/skills/mulmoterminal-shared-app/templates/question-box.md?raw";

type Outcome = { ok: true } | { ok: false; error: string };
interface Call {
  kind: "submit" | "correct" | "transition";
  cid: string;
  id?: string;
  values: Record<string, string>;
}

function pageOf(heading: string): string {
  const lines = questionBox.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  expect(`${heading}: ${start === -1 ? "no section" : "has a section"}`).toBe(`${heading}: has a section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const [, html] = (end === -1 ? rest : rest.slice(0, end)).join("\n").match(/```html\n([\s\S]*?)\n```/) ?? [];
  return html ?? "";
}

function load(heading: string) {
  const html = pageOf(heading);
  const [, script] = html.match(/<script>\n([\s\S]*?)\n<\/script>/) ?? [];
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");
  const calls: Call[] = [];
  let outcome: Outcome = { ok: true };
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  const record = (call: Call) => {
    calls.push(call);
    return Promise.resolve(outcome);
  };
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: (cid: string, values: Record<string, string>) => record({ kind: "submit", cid, values }),
    correct: (cid: string, id: string, values: Record<string, string>) => record({ kind: "correct", cid, id, values }),
    transition: (cid: string, id: string, to: string) => record({ kind: "transition", cid, id, values: { to } }),
    ready: () => {},
  };
  // Run rather than insert: jsdom does not execute <script> elements.
  new Function(script ?? "")();
  return {
    calls,
    answer: (next: Outcome) => {
      outcome = next;
    },
    tell: (data: Record<string, unknown[]>, viewer: Record<string, unknown> = { can: {} }) => onState?.(data, viewer),
    said: () => document.getElementById("say")?.textContent ?? "",
  };
}

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 32; turn += 1) {
    await Promise.resolve();
  }
};

const element = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  expect(`${selector}: ${found === null ? "missing" : "present"}`).toBe(`${selector}: present`);
  return found as T;
};

describe("question-box.md — views/box.html", () => {
  it("sends the question alone, and says it will appear once answered", async () => {
    const page = load("views/box.html");
    page.tell({ questions: [] });
    element<HTMLTextAreaElement>("#text").value = "  好きな本は？  ";
    element<HTMLButtonElement>("#send").click();
    await settle();
    expect(page.calls).toEqual([{ kind: "submit", cid: "questions", values: { text: "好きな本は？" } }]);
    expect(page.said()).toContain("公開されたら");
    expect(element<HTMLTextAreaElement>("#text").value).toBe("");
  });

  it("sends nothing for an empty question", async () => {
    const page = load("views/box.html");
    element<HTMLButtonElement>("#send").click();
    await settle();
    expect(page.calls).toEqual([]);
  });

  it("keeps the question when the send is refused", async () => {
    const page = load("views/box.html");
    page.answer({ ok: false, error: "denied" });
    element<HTMLTextAreaElement>("#text").value = "質問";
    element<HTMLButtonElement>("#send").click();
    await settle();
    expect(page.said()).toContain("denied");
    expect(element<HTMLTextAreaElement>("#text").value).toBe("質問");
  });

  it("draws what arrives newest first, with a placeholder for one not yet answered", () => {
    const page = load("views/box.html");
    page.tell({
      questions: [
        { id: "a", text: "古い質問", answer: "古い答え", askedAt: "2026-10-01T09:00:00Z", published: true },
        { id: "b", text: "新しい質問", askedAt: "2026-10-02T09:00:00Z", published: true },
      ],
    });
    const items = [...document.querySelectorAll("#answered li")].map((item) => item.textContent ?? "");
    expect(items).toEqual(["新しい質問（答えを準備中です）", "古い質問古い答え"]);
  });
});

describe("question-box.md — views/desk.html", () => {
  const asked = { id: "q1", text: "質問", status: "asked", askedAt: "2026-10-02T09:00:00Z" };

  it("writes the answer and moves an asked question to answered", async () => {
    const page = load("views/desk.html");
    page.tell({ questions: [asked] }, { can: { questions: { correctAny: true, transitionAny: true } } });
    element<HTMLTextAreaElement>("#questions textarea").value = " 答え ";
    element<HTMLButtonElement>("#questions button").click();
    await settle();
    expect(page.calls).toEqual([
      { kind: "correct", cid: "questions", id: "q1", values: { answer: "答え" } },
      { kind: "transition", cid: "questions", id: "q1", values: { to: "answered" } },
    ]);
  });

  it("does not move a question that is already answered", async () => {
    const page = load("views/desk.html");
    page.tell({ questions: [{ ...asked, status: "answered", answer: "前の答え" }] }, { can: { questions: { correctAny: true } } });
    element<HTMLTextAreaElement>("#questions textarea").value = "直した答え";
    element<HTMLButtonElement>("#questions button").click();
    await settle();
    expect(page.calls.map((call) => call.kind)).toEqual(["correct"]);
  });

  it("never writes the publish flag — it is a boolean, and correct sends strings", async () => {
    const page = load("views/desk.html");
    page.tell({ questions: [asked] }, { can: { questions: { correctAny: true } } });
    element<HTMLTextAreaElement>("#questions textarea").value = "答え";
    element<HTMLButtonElement>("#questions button").click();
    await settle();
    expect(page.calls.every((call) => !("published" in call.values))).toBe(true);
  });

  it("keeps a half-typed answer when a new question arrives", () => {
    const page = load("views/desk.html");
    const can = { can: { questions: { correctAny: true } } };
    page.tell({ questions: [asked] }, can);
    const draft = element<HTMLTextAreaElement>("#questions textarea");
    draft.value = "書きかけ";
    draft.dispatchEvent(new Event("input"));
    page.tell({ questions: [asked, { id: "q2", text: "次", status: "asked", askedAt: "2026-10-02T10:00:00Z" }] }, can);
    const values = [...document.querySelectorAll<HTMLTextAreaElement>("#questions textarea")].map((area) => area.value);
    expect(values).toEqual(["", "書きかけ"]);
  });

  it("draws no answer box for a reader who may not write one", () => {
    const page = load("views/desk.html");
    page.tell({ questions: [asked] });
    expect(document.querySelector("#questions textarea")).toBeNull();
  });
});
