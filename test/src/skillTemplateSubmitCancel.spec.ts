// @vitest-environment jsdom
//
// What every template's public page SAYS when the visitor declines the confirmation.
//
// A submission is confirmed OUTSIDE the frame: the parent draws the values, and declining answers
// the view `{ ok: false, error: "cancelled" }` — the same shape a refusal by the rules arrives in.
// So a page that prints `error` without looking at it tells somebody who deliberately pressed
// やめる that their booking failed, and a page that ignores `ok` thanks them for a record that does
// not exist. Both were shipped from a published survey before this was written down.
//
// It is not a defect a declaration gate can see (`skillTemplates.spec.ts`) and not one the sandbox
// checks look for: the page is well-formed, the button is wired, the write is correctly refused.
// The only thing that is wrong is the sentence on the screen — so the pages are RUN, and what they
// put in `#say` is the assertion.
//
// The cancel is pressed AFTER a real refusal on purpose. Clearing the message is the half a
// refactor drops: a page that returns early on `cancelled` without touching `#say` leaves the
// previous "予約できませんでした" standing, and the visitor reads it as the answer to the button
// they just pressed.
import { describe, it, expect, beforeEach } from "vitest";

import gym from "../../server/skills/mulmoterminal-shared-app/templates/gym.md?raw";
import meetingRoom from "../../server/skills/mulmoterminal-shared-app/templates/meeting-room.md?raw";
import salon from "../../server/skills/mulmoterminal-shared-app/templates/salon.md?raw";
import projectBoard from "../../server/skills/mulmoterminal-shared-app/templates/project-board.md?raw";
import survey from "../../server/skills/mulmoterminal-shared-app/templates/survey.md?raw";

/** The html block under one of a template's page headings — the same mapping the other template
 *  specs read, so a renamed section fails here rather than silently testing nothing. */
function pageOf(template: string, heading: string): string {
  const lines = template.split("\n");
  const start = lines.findIndex((line) => /^#{2,3} /.test(line) && line.replace(/^#{2,3} /, "").startsWith(heading));
  expect(`${heading}: ${start === -1 ? "no section" : "has a section"}`).toBe(`${heading}: has a section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,3} /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
  const [, html] = body.match(/```html\n([\s\S]*?)\n```/) ?? [];
  expect(`${heading}: ${html === undefined ? "no html" : "has html"}`).toBe(`${heading}: has html`);
  return html ?? "";
}

type Outcome = { ok: true } | { ok: false; error: string };

interface Page {
  /** What the parent will answer the NEXT submission with. */
  answer: (outcome: Outcome) => void;
  /** The data the page is handed, in the shape its own `onState` destructures. */
  tell: (data: Record<string, unknown[]>) => void;
  /** What the page is telling the visitor right now. */
  said: () => string;
}

function load(template: string, heading: string): Page {
  const html = pageOf(template, heading);
  const [, script] = html.match(/<script>\n([\s\S]*?)\n<\/script>/) ?? [];
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");

  let outcome: Outcome = { ok: true };
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: () => Promise.resolve(outcome),
    ready: () => {},
  };

  // Run rather than insert: jsdom does not execute <script> elements, and markup assigned through
  // `innerHTML` never runs them anywhere — a spec that only rendered the page would assert about
  // buttons nothing had wired.
  // eslint-disable-next-line sonarjs/code-eval -- the source is a file in this repository, read at test time
  new Function(script ?? "")();

  return {
    answer: (next) => {
      outcome = next;
    },
    tell: (data) => onState?.(data, { me: "visitor@example.com", can: {} }),
    said: () => document.getElementById("say")?.textContent ?? "",
  };
}

/** The click is synchronous and the handler is not — it awaits the write, and the parent's answer
 *  arrives a microtask later. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 32; turn += 1) {
    await Promise.resolve();
  }
};

const type = (id: string, value: string): void => {
  const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(`${id}: ${field === null ? "missing" : "present"}`).toBe(`${id}: present`);
  (field as HTMLInputElement).value = value;
};

/** One page per template that a VISITOR submits from, with whatever it needs before its submitting
 *  control exists at all. */
const PAGES: { name: string; open: () => Page; press: () => void }[] = [
  {
    name: "survey.md — views/survey.html",
    open: () => {
      const page = load(survey, "views/survey.html");
      page.tell({ questions: [{ id: "q1", order: 1, text: "運動していますか", choices: "はい\nいいえ" }] });
      type("who", "山田");
      const radio = document.querySelector("input[type=radio]") as HTMLInputElement;
      radio.checked = true;
      return page;
    },
    press: () => (document.getElementById("send") as HTMLButtonElement).click(),
  },
  {
    name: "salon.md — views/booking.html",
    open: () => {
      const page = load(salon, "views/booking.html");
      page.tell({ stylists: [{ id: "a", name: "A" }], slots: [{ id: "s1", state: "open", startAt: "2026-09-01T10:00", stylist: "a" }] });
      type("who", "山田");
      return page;
    },
    press: () => (document.querySelector("#grid button") as HTMLButtonElement).click(),
  },
  {
    name: "gym.md — views/signup.html",
    open: () => {
      const page = load(gym, "views/signup.html");
      page.tell({ classes: [{ id: "c1", title: "ヨガ", startsAt: "2026-09-01T10:00" }] });
      type("who", "山田");
      return page;
    },
    press: () => (document.querySelector("#list button") as HTMLButtonElement).click(),
  },
  {
    name: "meeting-room.md — views/grid.html",
    open: () => {
      const page = load(meetingRoom, "views/grid.html");
      page.tell({ rooms: [{ id: "r1", title: "会議室" }], slots: [{ id: "s1", state: "open", room: "r1", startAt: "2026-09-01T10:00" }] });
      type("who", "山田");
      type("why", "打合せ");
      return page;
    },
    press: () => (document.querySelector("#grid button") as HTMLButtonElement).click(),
  },
  {
    name: "project-board.md — views/board.html",
    open: () => {
      const page = load(projectBoard, "views/board.html");
      // No `mine` in the viewer, which is this board's own case: "nobody looked" is not "you have
      // not registered", so the take button is drawn and pressing it is allowed to reach the write.
      page.tell({ tasks: [{ id: "t1", title: "掃除" }], names: [], assignments: [] });
      return page;
    },
    press: () => (document.querySelector("#list button") as HTMLButtonElement).click(),
  },
];

describe("a visitor who declines the confirmation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  for (const page of PAGES) {
    it(`${page.name} says nothing about a failure`, async () => {
      const view = page.open();

      // A real refusal first, so there is a message on the screen to be left behind.
      view.answer({ ok: false, error: "permission-denied" });
      page.press();
      await settle();
      expect(`${page.name}: refusal ${view.said() === "" ? "silent" : "announced"}`).toBe(`${page.name}: refusal announced`);

      view.answer({ ok: false, error: "cancelled" });
      page.press();
      await settle();
      // Nothing at all: the visitor pressed やめる and already knows what they did. Anything here
      // is either a failure they did not have, or the previous refusal read as this one's answer.
      expect(`${page.name}: after cancel "${view.said()}"`).toBe(`${page.name}: after cancel ""`);
    });

    it(`${page.name} still says something when the write goes through`, async () => {
      const view = page.open();
      view.answer({ ok: true });
      page.press();
      await settle();
      expect(`${page.name}: success ${view.said() === "" ? "silent" : "announced"}`).toBe(`${page.name}: success announced`);
    });
  }
});
