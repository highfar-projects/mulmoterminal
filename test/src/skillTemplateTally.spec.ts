// @vitest-environment jsdom
//
// The tally template's pages, RUN. What the page owns: one write per press (a second write after an
// await loses the gesture mark and the preview host drops it), a vote that carries the choice and
// nothing else (`votes` is world-readable), counting only the declared choices, and asking whether
// this visitor already voted before they press anything.
import { describe, it, expect } from "vitest";

import tallyTemplate from "../../server/skills/mulmoterminal-shared-app/templates/tally.md?raw";

type Outcome = { ok: true } | { ok: false; error: string };
type Mine = (cid: string, key: string) => Promise<{ known: boolean; found: boolean }>;
interface Call {
  cid: string;
  values: Record<string, string>;
}

function pageOf(heading: string): string {
  const lines = tallyTemplate.split("\n");
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

const notVoted = { mine: { votes: [], notes: [] } };
const resultText = () => document.getElementById("result")?.textContent ?? "";

describe("tally.md — views/vote.html", () => {
  it("sends the choice alone, one write for the press", async () => {
    const page = load("views/vote.html");
    page.tell({ votes: [] }, notVoted);
    click('[data-choice="blue"]');
    await settle();
    expect(page.calls).toEqual([{ cid: "votes", values: { choice: "blue" } }]);
  });

  it("adds the name and comment as a SECOND press, to notes, never to votes", async () => {
    const page = load("views/vote.html");
    page.tell({ votes: [] }, notVoted);
    click('[data-choice="red"]');
    await settle();
    expect(document.getElementById("send-note")).not.toBeNull();
    (document.getElementById("name") as HTMLInputElement).value = "ゆき";
    (document.getElementById("comment") as HTMLTextAreaElement).value = "赤が好き";
    click("#send-note");
    await settle();
    expect(page.calls).toEqual([
      { cid: "votes", values: { choice: "red" } },
      { cid: "notes", values: { name: "ゆき", comment: "赤が好き" } },
    ]);
  });

  it("re-sends only the note when the note fails", async () => {
    const page = load("views/vote.html");
    page.tell({ votes: [] }, notVoted);
    click('[data-choice="red"]');
    await settle();
    page.next({ ok: false, error: "unavailable" });
    (document.getElementById("comment") as HTMLTextAreaElement).value = "もう一度";
    click("#send-note");
    await settle();
    expect(page.said()).toContain("unavailable");
    click("#send-note");
    await settle();
    expect(page.calls.map((call) => call.cid)).toEqual(["votes", "notes", "notes"]);
  });

  it("counts each declared choice, with shares, and drops a value nobody declared", () => {
    const page = load("views/vote.html");
    page.tell({ votes: [{ choice: "red" }, { choice: "red" }, { choice: "blue" }, { choice: "purple" }] }, notVoted);
    const text = resultText();
    expect(text).toContain("3 票");
    expect(text).toContain("赤2（67%）");
    expect(text).toContain("青1（33%）");
    expect(text).toContain("緑0（0%）");
  });

  it("draws no choices for a visitor who already voted", () => {
    const page = load("views/vote.html");
    page.tell({ votes: [{ choice: "red" }] }, { mine: { votes: [{ choice: "red" }], notes: [] } });
    expect(document.querySelector("[data-choice]")).toBeNull();
  });

  it("asks whether this visitor voted before they press, when the parent did not say", async () => {
    const asked: string[] = [];
    const mine: Mine = (cid) => {
      asked.push(cid);
      return Promise.resolve({ known: true, found: cid === "votes" });
    };
    const page = load("views/vote.html", mine);
    page.tell({ votes: [] });
    expect(document.querySelector("[data-choice]")).toBeNull();
    await settle();
    expect(asked.sort()).toEqual(["notes", "votes"]);
    expect(document.querySelector("[data-choice]")).toBeNull();
    expect(document.getElementById("send-note")).not.toBeNull();
  });
});

describe("tally.md — views/desk.html", () => {
  it("joins each vote to its note by id", () => {
    const page = load("views/desk.html");
    page.tell({
      votes: [
        { id: "u1", choice: "red" },
        { id: "u2", choice: "blue" },
      ],
      notes: [{ id: "u1", name: "ゆき", comment: "赤が好き" }],
    });
    const people = [...document.querySelectorAll("#people li")].map((item) => item.textContent ?? "");
    expect(people).toEqual(["赤ゆき赤が好き", "青"]);
  });
});
