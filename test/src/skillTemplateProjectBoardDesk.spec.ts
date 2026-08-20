// @vitest-environment jsdom
//
// The owner's desk from `project-board.md`, RUN rather than read.
//
// Its public board is exercised by `skillTemplateSubmitCancel.spec.ts` and its declaration by
// `skillTemplates.spec.ts`, and neither of those touches this page — which is the half of the
// template that is new. A desk that drew nothing, or drew everything for everybody, would have
// passed both.
//
// The two failures it is here for are opposite and both silent:
//
//   A CONTROL THAT IS NOT THERE. `withdrawAny` is `false` for a whole tier until the app is
//   republished, and a desk that reads the capability wrongly is a page with no buttons — which
//   looks exactly like a page whose author got the names wrong.
//
//   A CONTROL THAT CANNOT WORK. `/m/` admits every member, including a `viewer` and somebody
//   scoped to another collection. A form drawn for them is refused on every press, by rules that
//   name nothing.
import { describe, it, expect, beforeEach } from "vitest";

// Through Vite rather than `node:fs`: this spec belongs to the DOM-typed project, which carries no
// node globals — the same reason `skillTemplateLivePollDesk.spec.ts` reads its template this way.
import template from "../../server/skills/mulmoterminal-shared-app/templates/project-board.md?raw";

/** The html block under one of the template's page headings — the same mapping the other template
 *  specs read, so a renamed section fails here rather than silently testing nothing. */
function pageOf(heading: string): string {
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

interface Capability {
  cid: string;
  transitionAny: boolean;
  transitionOwn: boolean;
  assign: boolean;
  assignees: string[];
  withdrawFrom: string[];
  withdrawAny: boolean;
}

/** What the projection resolves for a reader who may do everything on this collection, and for one
 *  who holds a role and may write nothing — the `viewer` the member tier also admits. */
const may = (cid: string, over: Partial<Capability> = {}): Capability => ({
  cid,
  transitionAny: true,
  transitionOwn: false,
  assign: false,
  assignees: [],
  withdrawFrom: [],
  withdrawAny: true,
  ...over,
});

const mayNot = (cid: string): Capability => may(cid, { transitionAny: false, withdrawAny: false });

type Sent = { kind: string; cid: string; id?: string; to?: string; values?: Record<string, string> };

/** The desk in a document, with a parent that records what it was asked to write. */
function loadDesk(): {
  sent: Sent[];
  tell: (data: Record<string, unknown[]>, can: Record<string, Capability>) => void;
  said: () => string;
  buttons: () => string[];
  press: (label: string) => void;
} {
  const html = pageOf("views/desk.html");
  const [, script] = html.match(/<script>\n([\s\S]*?)\n<\/script>/) ?? [];
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");

  const sent: Sent[] = [];
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: (cid: string, values: Record<string, string>) => {
      sent.push({ kind: "submit", cid, values });
      return Promise.resolve({ ok: true });
    },
    transition: (cid: string, id: string, to: string) => {
      sent.push({ kind: "transition", cid, id, to });
      return Promise.resolve({ ok: true });
    },
    withdraw: (cid: string, id: string) => {
      sent.push({ kind: "withdraw", cid, id });
      return Promise.resolve({ ok: true });
    },
    ready: () => {},
  };

  // Run rather than insert: jsdom does not execute <script> elements, and markup assigned through
  // `innerHTML` never runs them anywhere — a spec that only rendered the page would assert about
  // buttons nothing had wired.
  // eslint-disable-next-line sonarjs/code-eval -- the source is a file in this repository, read at test time
  new Function(script ?? "")();

  const all = (): HTMLButtonElement[] => [...document.querySelectorAll("button")] as HTMLButtonElement[];
  return {
    sent,
    tell: (data, can) => onState?.(data, { me: "owner@example.com", can }),
    said: () => document.getElementById("say")?.textContent ?? "",
    buttons: () => all().map((button) => button.textContent ?? ""),
    press: (label) => {
      const button = all().find((candidate) => candidate.textContent === label);
      expect(`${label}: ${button === undefined ? "missing" : "present"}`).toBe(`${label}: present`);
      button?.click();
    },
  };
}

/** The click handler is async — the write is awaited and the parent answers a microtask later. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 32; turn += 1) {
    await Promise.resolve();
  }
};

const TASKS = [{ id: "fix-login", title: "ログインを直す" }];
const DOING = [{ id: "fix-login", uid: "uid-1", status: "doing" }];
const OWNER_CAN = { tasks: may("tasks", { transitionAny: false }), assignments: may("assignments") };

describe("the project-board owner's desk", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a task through the owner-only form", async () => {
    // The form exists because `public.submit.tasks` is declared; it is usable because the rules
    // reach the writer branch independently of the closed window. What is pinned here is that the
    // page sends the create at all, and sends the fields the declaration names.
    const desk = loadDesk();
    desk.tell({ tasks: [], assignments: [], names: [] }, OWNER_CAN);
    (document.getElementById("t-title") as HTMLInputElement).value = "新しい作業";
    desk.press("この作業を足す");
    await settle();

    expect(desk.sent).toEqual([{ kind: "submit", cid: "tasks", values: { title: "新しい作業", detail: "", due: "" } }]);
    expect(desk.said()).not.toBe("");
  });

  it("hides every control from a member who holds no role here", () => {
    // `/m/` admits anybody on the roster — a `viewer`, or somebody scoped to another collection —
    // and they read the same page as the owner. Drawing the form for them is drawing a button that
    // is refused on every press, by rules that name nothing.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: DOING, names: [] }, { tasks: mayNot("tasks"), assignments: mayNot("assignments") });

    expect(desk.buttons()).toEqual([]);
    expect(document.getElementById("t-title")).toBeNull();
    expect(document.getElementById("add")?.textContent ?? "").toContain("owner / editor");
  });

  it("keeps what the owner has typed when somebody else's write arrives", async () => {
    // The state message lands whenever anybody moves a row. Rebuilding the inputs on each one
    // empties the field somebody is halfway through — which reads as the page throwing their work
    // away, and is the reason the form is built once rather than on every render.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: [], names: [] }, OWNER_CAN);
    (document.getElementById("t-title") as HTMLInputElement).value = "打ちかけ";
    desk.tell({ tasks: TASKS, assignments: DOING, names: [] }, OWNER_CAN);

    expect((document.getElementById("t-title") as HTMLInputElement).value).toBe("打ちかけ");
  });

  it("frees somebody else's assignment, and asks first", async () => {
    // The destructive one, and the whole reason `writerDelete` exists. It is asked in the PAGE
    // because the sandbox ignores `confirm()` — a guard written with it would answer false and the
    // button would silently do nothing.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: DOING, names: [{ id: "uid-1", name: "山田" }] }, OWNER_CAN);

    desk.press("担当を外す");
    expect(desk.sent).toEqual([]);
    desk.press("はい");
    await settle();

    expect(desk.sent).toEqual([{ kind: "withdraw", cid: "assignments", id: "fix-login" }]);
  });

  it("will not delete a task while somebody is on it, and says why", async () => {
    // The rules cannot express this: deleting the task leaves the assignment holding an id whose
    // task is gone, and nothing refuses it. So the page is where it is stopped — and it says what
    // to do rather than merely refusing.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: DOING, names: [] }, OWNER_CAN);

    desk.press("この作業を消す");
    expect(document.body.textContent ?? "").toContain("先に担当を外してください");
    expect(desk.buttons()).not.toContain("はい");

    desk.press("わかった");
    expect(desk.sent).toEqual([]);
  });

  it("deletes a task nobody is on, after the second press", async () => {
    // The paired acceptance: the guard above must stop one case and not the feature.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: [], names: [] }, OWNER_CAN);

    desk.press("この作業を消す");
    desk.press("はい");
    await settle();

    expect(desk.sent).toEqual([{ kind: "withdraw", cid: "tasks", id: "fix-login" }]);
  });

  it("offers the status move only where the projection carries it", async () => {
    // `transitionAny` is the staff table (`collections.assignments.transitions`), which is a
    // different declaration from the submitter's `selfTransitions`. A desk that drew this from the
    // audience rather than the capability would offer it on an app that never declared one.
    const desk = loadDesk();
    desk.tell({ tasks: TASKS, assignments: DOING, names: [] }, { ...OWNER_CAN, assignments: may("assignments", { transitionAny: false }) });
    expect(desk.buttons()).not.toContain("完了にする");

    desk.tell({ tasks: TASKS, assignments: DOING, names: [] }, OWNER_CAN);
    desk.press("完了にする");
    await settle();
    expect(desk.sent).toEqual([{ kind: "transition", cid: "assignments", id: "fix-login", to: "done" }]);
  });
});
