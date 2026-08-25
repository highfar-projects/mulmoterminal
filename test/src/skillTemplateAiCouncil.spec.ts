// @vitest-environment jsdom
//
// The two pages of `ai-council.md`, RUN rather than read.
//
// `skillTemplates.spec.ts` holds the template to the real declaration gate. What it cannot reach is
// whether the pages DO what the template says they do, and this shape's claims are all behavioural:
//
//   THE THREAD IS IN THE SERVER'S ORDER. `postedAt` is `stampField` — the whole argument for
//   stamping it is that agents compose in parallel and a self-declared time put answers above their
//   questions. A page that rendered in arrival order would look right in every test with one
//   speaker and be wrong the moment there were two.
//
//   A ROW WITH NO STAMP SORTS LAST. The writer sees their own row before the rules have stamped it.
//   Sorted naively the empty key sorts FIRST, so the newest message lands at the top and jumps to
//   the bottom a moment later.
//
//   THE CLOSE IS ONE-WAY, SO IT IS ASKED TWICE. `confirm()` is ignored in this sandbox — it shows
//   nothing and returns false — so the second question has to be DRAWN. A page that called
//   `transition` on the first press would close a discussion on a stray click, and nothing reopens
//   it.
//
//   A CONTROL IS DRAWN FROM WHAT THE RULES ALLOW, NOT FROM THE ROLE. `viewer.can` is the only
//   honest source; a button drawn from the role and refused by Firestore reads as a broken app.
//
//   A STAMPED FIELD IS NEVER SENT. `createdAt` is the server's, and a value from the page would be
//   overwritten — so the submission must not carry one.
//
//   A COMPOSER THAT EATS WHAT YOU TYPED. A submission waits on a confirmation and a write, and
//   somebody who keeps typing has written the NEXT question. Clearing the box unconditionally
//   throws it away.
import { describe, it, expect, afterEach } from "vitest";

// Through Vite rather than `node:fs`: this spec belongs to the DOM-typed project, which carries no
// node globals — the same reason the other template specs read their template this way.
import template from "../../server/skills/mulmoterminal-shared-app/templates/ai-council.md?raw";

/** The html block under the template's page heading — the same mapping the other template specs
 *  read, so a renamed section fails here rather than silently testing nothing. */
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

/** The desk closes over a listener on the DOCUMENT, which jsdom shares between every test in this
 *  file: a listener from the page loaded two tests ago still matches the template's own selectors
 *  and would answer through the state IT captured. Recorded as it is attached, because the handler
 *  is anonymous and this is the only moment anything can hold it. */
const attached: { type: string; listener: EventListenerOrEventListenerObject }[] = [];

function runPage(script: string): void {
  for (const { type, listener } of attached.splice(0)) document.removeEventListener(type, listener);
  const add = document.addEventListener.bind(document);
  document.addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
    attached.push({ type, listener });
    add(type, listener, options as boolean);
  };
  try {
    // eslint-disable-next-line sonarjs/code-eval -- the source is a file in this repository, read at test time
    new Function(script)();
  } finally {
    document.addEventListener = add;
  }
}

afterEach(() => {
  for (const { type, listener } of attached.splice(0)) document.removeEventListener(type, listener);
});

/** A stamp the rules would have written: UTC, nine fractional digits. */
const at = (minute: number): string => `2026-03-04T09:${String(minute).padStart(2, "0")}:00.000000000Z`;

interface Topic {
  id: string;
  title: string;
  question?: string;
  status: string;
  createdAt: string | null;
}
interface Speaker {
  id: string;
  name: string;
  mark?: string;
  hue?: number;
  stance?: string;
  model?: string;
}
interface Message {
  id: string;
  topicId: string;
  speakerId: string;
  body: string;
  replyTo?: string;
  status: string;
  postedAt: string | null;
}

const OPEN: Topic = { id: "t1", title: "Ship on Friday?", question: "The context.", status: "open", createdAt: at(0) };
const SKEPTIC: Speaker = { id: "s1", name: "The Skeptic", mark: "SK", hue: 25, stance: "Asks what would falsify it.", model: "claude-opus-5" };
const BUILDER: Speaker = { id: "s2", name: "The Builder", stance: "Wants it shipped.", model: "claude-sonnet-5" };

const message = (over: Partial<Message> & { id: string }): Message => ({
  topicId: "t1",
  speakerId: "s1",
  body: "text",
  status: "posted",
  postedAt: at(0),
  ...over,
});

function scriptOf(heading: string): { script: string; html: string } {
  const html = pageOf(heading);
  const [, script] = html.match(/<script>\n([\s\S]*?)\n<\/script>/) ?? [];
  return { script: script ?? "", html };
}

/** A macrotask, which is where the room page defers arming its live region. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The desk's click handler is async — the write is awaited and the parent answers later. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 32; turn += 1) await Promise.resolve();
};

function loadRoom(): {
  tell: (data: { topics?: Topic[]; speakers?: Speaker[]; messages?: Message[] }) => void;
  bodies: () => string[];
  names: () => string[];
  cast: () => string[];
  nodes: () => Element[];
  foot: () => string;
  hero: () => string;
  eyebrow: () => string;
  tabs: () => string[];
  pick: (id: string) => void;
} {
  const { script, html } = scriptOf("views/room.html");
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");

  let onState: ((data: unknown) => void) | null = null;
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown) => void) => {
      onState = handler;
    },
    ready: () => {},
  };
  // Run rather than insert: jsdom does not execute a <script> assigned through `innerHTML`, so a
  // spec that only rendered the page would assert about controls nothing had wired.
  runPage(script);

  return {
    tell: (data) => onState?.(data),
    bodies: () => [...document.querySelectorAll(".thread .body")].map((n) => n.textContent ?? ""),
    names: () => [...document.querySelectorAll(".thread .name")].map((n) => n.textContent ?? ""),
    cast: () => [...document.querySelectorAll("#cast .who")].map((n) => n.textContent ?? ""),
    nodes: () => [...document.querySelectorAll(".thread > .row")],
    foot: () => document.getElementById("foot")?.textContent ?? "",
    hero: () => document.getElementById("hero")?.textContent ?? "",
    eyebrow: () => document.getElementById("eyebrow")?.textContent ?? "",
    tabs: () => [...document.querySelectorAll("#tabs .tab")].map((n) => n.textContent ?? ""),
    pick: (id) => (document.querySelector(`[data-topic="${id}"]`) as HTMLButtonElement).click(),
  };
}

describe("ai-council.md's public room page", () => {
  it("threads the messages in the server's order, whatever order they arrive in", async () => {
    const room = loadRoom();
    room.tell({
      topics: [OPEN],
      speakers: [SKEPTIC, BUILDER],
      // Deliberately out of order, and the LATER one first: an agent that composed a reply quickly
      // is exactly this case, and it is what a self-declared `postedAt` got wrong.
      messages: [
        message({ id: "m2", speakerId: "s2", body: "second", postedAt: at(5) }),
        message({ id: "m1", speakerId: "s1", body: "first", postedAt: at(1) }),
      ],
    });
    await tick();
    expect(room.bodies()).toEqual(["first", "second"]);
  });

  it("sorts a row the rules have not stamped yet to the END", async () => {
    const room = loadRoom();
    room.tell({
      topics: [OPEN],
      speakers: [SKEPTIC],
      messages: [message({ id: "m9", body: "just written", postedAt: null }), message({ id: "m1", body: "older", postedAt: at(1) })],
    });
    await tick();
    // Not ["just written", "older"] — an empty key sorted naively is the smallest string there is.
    expect(room.bodies()).toEqual(["older", "just written"]);
  });

  it("lists as the cast only who SPOKE here, in the order they first spoke", async () => {
    const room = loadRoom();
    room.tell({
      topics: [OPEN],
      // Three registered; one of them has said nothing, and the other two speak in reverse order.
      speakers: [SKEPTIC, BUILDER, { id: "s3", name: "The Silent" }],
      messages: [message({ id: "m1", speakerId: "s2", body: "b", postedAt: at(1) }), message({ id: "m2", speakerId: "s1", body: "a", postedAt: at(2) })],
    });
    await tick();
    expect(room.cast()).toEqual(["The Builder", "The Skeptic"]);
  });

  it("keeps the node of a message it has already drawn, so a reader's selection survives", async () => {
    const room = loadRoom();
    const state = { topics: [OPEN], speakers: [SKEPTIC], messages: [message({ id: "m1", body: "first", postedAt: at(1) })] };
    room.tell(state);
    await tick();
    const [before] = room.nodes();
    // Production sends `onState` on EVERY change, so this is the ordinary case rather than an edge.
    room.tell({ ...state, messages: [...state.messages, message({ id: "m2", body: "second", postedAt: at(2) })] });
    await tick();
    expect(room.nodes()[0]).toBe(before);
    expect(room.bodies()).toEqual(["first", "second"]);
  });

  it("says a closed discussion is closed, and stops telling the reader to reload", async () => {
    const room = loadRoom();
    room.tell({
      topics: [{ ...OPEN, status: "closed" }],
      speakers: [SKEPTIC],
      messages: [message({ id: "m1", body: "said", postedAt: at(1) })],
    });
    await tick();
    expect(room.eyebrow()).toBe("Closed");
    expect(room.hero()).toContain("The host closed this discussion");
    expect(room.foot()).toContain("closed");
    expect(room.foot()).not.toContain("reload");
  });

  it("tells a reader of an OPEN discussion that the page is a snapshot", async () => {
    // The public view cannot watch `messages` — it takes submissions — so the page must not imply
    // it is keeping up.
    const room = loadRoom();
    room.tell({ topics: [OPEN], speakers: [SKEPTIC], messages: [message({ id: "m1", postedAt: at(1) })] });
    await tick();
    expect(room.foot()).toContain("reload");
  });

  it("draws a speaker who registered no mark and no hue", async () => {
    // Nothing about a speaker row is required beyond `name`, and a page that assumed otherwise
    // would show an empty tile for the first agent that skipped a field.
    const room = loadRoom();
    room.tell({ topics: [OPEN], speakers: [BUILDER], messages: [message({ id: "m1", speakerId: "s2", body: "x", postedAt: at(1) })] });
    await tick();
    expect(room.names()).toEqual(["The Builder"]);
    const avatar = document.querySelector(".thread .avatar") as HTMLElement;
    expect(avatar.textContent).toBe("Th");
    expect(avatar.getAttribute("style") ?? "").toMatch(/oklch\(58% \.13 \d+\)/);
  });

  it("shows the newest OPEN topic by default, and lets a reader switch to a closed one", async () => {
    const room = loadRoom();
    const older: Topic = { id: "t0", title: "Last week", status: "closed", createdAt: at(0) };
    room.tell({
      topics: [older, { ...OPEN, createdAt: at(9) }],
      speakers: [SKEPTIC],
      messages: [message({ id: "m0", topicId: "t0", body: "old", postedAt: at(1) }), message({ id: "m1", topicId: "t1", body: "new", postedAt: at(2) })],
    });
    await tick();
    expect(room.bodies()).toEqual(["new"]);
    expect(room.tabs()).toEqual(["Ship on Friday?", "Last week"]);
    room.pick("t0");
    await tick();
    expect(room.bodies()).toEqual(["old"]);
  });
});

function loadDesk(): {
  sent: { kind: string; cid: string; id?: string; to?: string; values?: Record<string, string> }[];
  hold: () => void;
  release: (outcome: { ok: boolean; error?: string }) => void;
  tell: (data: { topics?: Topic[]; speakers?: Speaker[]; messages?: Message[] }, can?: Record<string, unknown>) => void;
  click: (selector: string) => void;
  has: (selector: string) => boolean;
  sayTopic: () => string;
  saySubmit: () => string;
  type: (title: string, question?: string) => void;
  post: () => void;
  titleValue: () => string;
  questionValue: () => string;
} {
  const { script, html } = scriptOf("views/desk.html");
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");

  const sent: { kind: string; cid: string; id?: string; to?: string; values?: Record<string, string> }[] = [];
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  let waiting: ((outcome: { ok: boolean; error?: string }) => void) | null = null;
  let holding = false;

  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: (cid: string, values: Record<string, string>) => {
      sent.push({ kind: "submit", cid, values });
      if (!holding) return Promise.resolve({ ok: true });
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        waiting = resolve;
      });
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
  runPage(script);

  const title = document.getElementById("title") as HTMLInputElement;
  const question = document.getElementById("question") as HTMLTextAreaElement;
  return {
    sent,
    hold: () => {
      holding = true;
    },
    release: (outcome) => {
      holding = false;
      waiting?.(outcome);
      waiting = null;
    },
    tell: (data, can = { topics: { transitionAny: true }, messages: { withdrawAny: true } }) => onState?.(data, { me: "host@example.com", can }),
    click: (selector) => (document.querySelector(selector) as HTMLButtonElement).click(),
    has: (selector) => document.querySelector(selector) !== null,
    sayTopic: () => document.getElementById("sayTopic")?.textContent ?? "",
    saySubmit: () => document.getElementById("saySubmit")?.textContent ?? "",
    type: (t, q = "") => {
      title.value = t;
      question.value = q;
    },
    post: () => (document.getElementById("post") as HTMLButtonElement).click(),
    titleValue: () => title.value,
    questionValue: () => question.value,
  };
}

describe("ai-council.md's desk page", () => {
  it("asks twice before closing a topic, because nothing reopens it", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [OPEN], speakers: [], messages: [] });

    desk.click('[data-move="t1"]');
    await settle();
    // The first press must NOT have closed anything: `confirm()` shows nothing in this sandbox, so
    // the warning has to be drawn and the press re-taken.
    expect(desk.sent).toEqual([]);
    expect(desk.sayTopic()).toContain("final");

    desk.click('[data-move="t1"]');
    await settle();
    expect(desk.sent).toEqual([{ kind: "transition", cid: "topics", id: "t1", to: "closed" }]);
  });

  it("draws the Close control from what the rules allow, not from the role", () => {
    const desk = loadDesk();
    desk.tell({ topics: [OPEN], speakers: [], messages: [] }, { topics: { transitionAny: false }, messages: { withdrawAny: false } });
    expect(desk.has('[data-move="t1"]')).toBe(false);
    // And the row is still drawn — the reader may look at a topic they may not close.
    expect(desk.has('[data-show="t1"]')).toBe(true);
  });

  it("offers no Close on an already closed topic, and says the close is final on the page", () => {
    const desk = loadDesk();
    desk.tell({ topics: [{ ...OPEN, status: "closed" }], speakers: [], messages: [] });
    expect(desk.has('[data-move="t1"]')).toBe(false);
    expect(document.getElementById("thread")?.textContent ?? "").toContain("you included");
  });

  it("arms a removal before it takes a message away", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [OPEN], speakers: [SKEPTIC], messages: [message({ id: "m1", body: "regrettable", postedAt: at(1) })] });

    desk.click('[data-arm="m1"]');
    expect(desk.sent).toEqual([]);
    desk.click('[data-del="m1"]');
    await settle();
    expect(desk.sent).toEqual([{ kind: "withdraw", cid: "messages", id: "m1" }]);
  });

  it("posts a topic without the stamped field the rules own", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.type("Ship on Friday?", "The context.");
    desk.post();
    await settle();
    expect(desk.sent).toEqual([{ kind: "submit", cid: "topics", values: { title: "Ship on Friday?", question: "The context.", status: "open" } }]);
    // Named rather than implied by the object above: `createdAt` is `stampField`, and a value sent
    // from here is overwritten — so sending one teaches an author it is theirs to choose.
    expect(Object.keys(desk.sent[0]?.values ?? {})).not.toContain("createdAt");
  });

  it("does not throw away a question typed while the last one was being written", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.hold();
    desk.type("first");
    desk.post();
    await settle();
    // The host gave up waiting and started the next one.
    desk.type("second");
    desk.release({ ok: true });
    await settle();
    expect(desk.titleValue()).toBe("second");
  });

  it("keeps a question rewritten while the last one was in flight, even when the title stands", async () => {
    // The near-miss: guarding both fields on the TITLE alone passes the test above and still eats
    // this, because the host who rewrote only the question never touched the title.
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.hold();
    desk.type("Ship on Friday?", "first context");
    desk.post();
    await settle();
    desk.type("Ship on Friday?", "second context");
    desk.release({ ok: true });
    await settle();
    expect(desk.questionValue()).toBe("second context");
    // And the title, which WAS what was sent, is cleared as before.
    expect(desk.titleValue()).toBe("");
  });

  it("clears the box when what was sent is still what is in it", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.type("first", "context");
    desk.post();
    await settle();
    expect(desk.titleValue()).toBe("");
    expect(desk.questionValue()).toBe("");
  });

  it("says nothing when the host cancels the confirmation, because that is not an error", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.hold();
    desk.type("first");
    desk.post();
    await settle();
    desk.release({ ok: false, error: "cancelled" });
    await settle();
    expect(desk.saySubmit()).toBe("");
    expect(desk.titleValue()).toBe("first");
  });

  it("refuses to post a topic with no title, without asking the parent", async () => {
    const desk = loadDesk();
    desk.tell({ topics: [], speakers: [], messages: [] });
    desk.type("   ");
    desk.post();
    await settle();
    expect(desk.sent).toEqual([]);
    expect(desk.saySubmit()).toContain("title");
  });
});
