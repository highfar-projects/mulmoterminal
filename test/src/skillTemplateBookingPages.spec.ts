// @vitest-environment jsdom
//
// The pages of the booking-shaped templates, RUN.
//
// What the declaration gate cannot see is the half of each guarantee the page owns. `class-seats`
// keeps names hidden and capacity enforced in the rules, but "N left" is the page counting mirror
// rows, and a page that picks the same refused seat again sends the visitor into the same refusal
// forever. `schedule-poll` enforces one answer per participant in the rules, so a page that
// re-submits instead of correcting is refused on every second visit.
import { describe, it, expect, beforeEach } from "vitest";

import classSeats from "../../server/skills/mulmoterminal-shared-app/templates/class-seats.md?raw";
import meetingRoom from "../../server/skills/mulmoterminal-shared-app/templates/meeting-room.md?raw";
import schedulePoll from "../../server/skills/mulmoterminal-shared-app/templates/schedule-poll.md?raw";

type Outcome = { ok: true } | { ok: false; error: string };
interface Call {
  kind: "submit" | "correct" | "withdraw";
  cid: string;
  id?: string;
  values: Record<string, string>;
}
type Mine = (cid: string, key: string) => Promise<{ known: boolean; found: boolean; record?: Record<string, unknown> }>;

function pageOf(template: string, heading: string): string {
  const lines = template.split("\n");
  const start = lines.findIndex((line) => /^#{2,3} /.test(line) && line.replace(/^#{2,3} /, "").startsWith(heading));
  expect(`${heading}: ${start === -1 ? "no section" : "has a section"}`).toBe(`${heading}: has a section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,3} /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n");
  const [, html] = body.match(/```html\n([\s\S]*?)\n```/) ?? [];
  return html ?? "";
}

function load(template: string, heading: string, mine?: Mine) {
  const html = pageOf(template, heading);
  const [, script] = html.match(/<script>\n([\s\S]*?)\n<\/script>/) ?? [];
  document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/, "");
  const calls: Call[] = [];
  let outcome: Outcome = { ok: true };
  let onState: ((data: unknown, viewer: unknown) => void) | null = null;
  (window as unknown as { __MC_APP_VIEW: unknown }).__MC_APP_VIEW = {
    onState: (handler: (data: unknown, viewer: unknown) => void) => {
      onState = handler;
    },
    submit: (cid: string, values: Record<string, string>) => {
      calls.push({ kind: "submit", cid, values });
      return Promise.resolve(outcome);
    },
    correct: (cid: string, id: string, values: Record<string, string>) => {
      calls.push({ kind: "correct", cid, id, values });
      return Promise.resolve(outcome);
    },
    withdraw: (cid: string, id: string) => {
      calls.push({ kind: "withdraw", cid, id, values: {} });
      return Promise.resolve(outcome);
    },
    ...(mine ? { mine } : {}),
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

const type = (selector: string, value: string): void => {
  const field = document.querySelector(selector);
  expect(`${selector}: ${field === null ? "missing" : "present"}`).toBe(`${selector}: present`);
  (field as HTMLInputElement).value = value;
};

const click = (selector: string): void => {
  const target = document.querySelector(selector);
  expect(`${selector}: ${target === null ? "missing" : "present"}`).toBe(`${selector}: present`);
  (target as HTMLElement).click();
};

const seat = (id: string, classId: string, state: "open" | "taken") => ({ id, classId, state, opensAt: 0, closesAt: 0 });

describe("class-seats.md — views/classes.html", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const classes = [
    { id: "c1", title: "ジャズ", startAt: "2026-10-03T10:00" },
    { id: "c2", title: "ヒップホップ", startAt: "2026-10-03T11:00" },
  ];
  const seats = [
    seat("c1-01", "c1", "open"),
    seat("c1-02", "c1", "taken"),
    seat("c1-03", "c1", "open"),
    seat("c2-01", "c2", "taken"),
    seat("c2-02", "c2", "taken"),
  ];

  it("counts open seats as what is left and every seat as the capacity", () => {
    const page = load(classSeats, "views/classes.html");
    page.tell({ classes, seats });
    const rows = [...document.querySelectorAll("#list > div")].map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("残り 2 席 / 定員 3");
    expect(rows[1]).toContain("満席（定員 2）");
    // A full class offers nothing to press.
    expect(document.querySelectorAll("#list button")).toHaveLength(1);
  });

  it("books an OPEN seat of the pressed class and sends no class field", async () => {
    const page = load(classSeats, "views/classes.html");
    page.tell({ classes, seats });
    type("#who", "山田");
    click("#list button");
    await settle();
    expect(page.calls).toHaveLength(1);
    const [call] = page.calls;
    expect(["c1-01", "c1-03"]).toContain(call?.values.seat);
    expect(Object.keys(call?.values ?? {}).sort()).toEqual(["requesterName", "seat", "status"]);
  });

  it("does not pick a refused seat again while another is open", async () => {
    const page = load(classSeats, "views/classes.html");
    page.tell({ classes, seats });
    type("#who", "山田");
    page.answer({ ok: false, error: "permission-denied" });
    click("#list button");
    await settle();
    click("#list button");
    await settle();
    const [first, second] = page.calls.map((call) => call.values.seat);
    expect(first).not.toBe(second);
    // Refused is not taken: the count still comes from the mirror alone.
    expect(document.querySelector("#list > div")?.textContent).toContain("残り 2 席");
  });

  it("asks for a name before writing anything", async () => {
    const page = load(classSeats, "views/classes.html");
    page.tell({ classes, seats });
    click("#list button");
    await settle();
    expect(page.calls).toHaveLength(0);
    expect(page.said()).not.toBe("");
  });
});

describe("class-seats.md — views/desk.html", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const state = {
    classes: [{ id: "c1", title: "ジャズ", startAt: "2026-10-03T10:00" }],
    seats: [seat("c1-01", "c1", "taken"), seat("c1-02", "c1", "open")],
    bookings: [{ id: "c1-01", seat: "c1-01", requesterName: "山田", requesterEmail: "y@example.jp", status: "booked" }],
  };

  it("lists the names per class and draws no cancel without the role's permission", () => {
    const page = load(classSeats, "views/desk.html");
    page.tell(state, { can: {} });
    expect(document.body.textContent).toContain("1 / 2 人");
    expect(document.body.textContent).toContain("山田");
    expect(document.querySelectorAll("#rows button")).toHaveLength(0);
  });

  it("cancels on the second press, by the booking's id", async () => {
    const page = load(classSeats, "views/desk.html");
    page.tell(state, { can: { bookings: { withdrawAny: true } } });
    click("#rows button");
    await settle();
    expect(page.calls).toHaveLength(0);
    click("#rows button");
    await settle();
    expect(page.calls).toEqual([{ kind: "withdraw", cid: "bookings", id: "c1-01", values: {} }]);
    expect(page.said()).not.toBe("");
  });
});

// The meeting room's cancellation is the desk's: a booker keyed by the slot cannot reach a page of
// their own, so this button is the only way a slot is given back.
describe("meeting-room.md — views/desk.html", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const state = {
    slots: [{ id: "r1-0900", startAt: "2026-10-05T09:00" }],
    bookings: [{ id: "r1-0900", slot: "r1-0900", requesterName: "山田", requesterEmail: "y@example.jp", purpose: "定例", status: "booked" }],
  };

  it("lists the bookings and draws no cancel without the role's permission", () => {
    const page = load(meetingRoom, "views/desk.html");
    page.tell(state, { can: {} });
    expect(document.body.textContent).toContain("山田");
    expect(document.querySelectorAll("#rows button")).toHaveLength(0);
  });

  it("cancels on the second press, by the booking's id", async () => {
    const page = load(meetingRoom, "views/desk.html");
    page.tell(state, { can: { bookings: { withdrawAny: true } } });
    click("#rows button");
    await settle();
    expect(page.calls).toHaveLength(0);
    click("#rows button");
    await settle();
    expect(page.calls).toEqual([{ kind: "withdraw", cid: "bookings", id: "r1-0900", values: {} }]);
    expect(page.said()).toBe("取り消しました。");
  });
});

describe("schedule-poll.md — views/poll.html", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const FUTURE = Date.now() + 86_400_000;
  const poll = { id: "p1", title: "忘年会", dates: "12/1\n12/2\n12/3", closesAt: FUTURE };
  const answers = [
    { id: "u1_p1", pollId: "p1", name: "佐藤", marks: "○×○" },
    { id: "u2_p1", pollId: "p1", name: "鈴木", marks: "○△×" },
  ];

  it("draws everyone's marks and the ○ tally per date", () => {
    const page = load(schedulePoll, "views/poll.html");
    page.tell({ polls: [poll], answers });
    const body = [...document.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(body).toEqual([
      ["佐藤", "○", "×", "○", ""],
      ["鈴木", "○", "△", "×", ""],
    ]);
    const foot = [...document.querySelectorAll("tfoot td")].map((cell) => cell.textContent);
    expect(foot.slice(1, 4)).toEqual(["2", "0", "1"]);
  });

  it("submits a new answer with one mark per date, cycled by pressing", async () => {
    const page = load(schedulePoll, "views/poll.html");
    page.tell({ polls: [poll], answers: [] });
    type("#name-p1", "田中");
    // × → ○ on the first date, × → ○ → △ on the second.
    const picks = () => [...document.querySelectorAll<HTMLButtonElement>("button.pick")];
    picks()[0]?.click();
    picks()[1]?.click();
    picks()[1]?.click();
    click("[data-send='p1']");
    await settle();
    expect(page.calls).toEqual([{ kind: "submit", cid: "answers", values: { pollId: "p1", name: "田中", marks: "○△×", comment: "", status: "answered" } }]);
  });

  it("corrects the visitor's own row instead of submitting a second one", async () => {
    const page = load(schedulePoll, "views/poll.html");
    page.tell({ polls: [poll], answers }, { can: {}, mine: { answers: [{ id: "u1_p1", pollId: "p1", name: "佐藤", marks: "○×○" }] } });
    expect(document.querySelector("[data-send='p1']")?.textContent).toBe("回答を直す");
    expect((document.querySelector("#name-p1") as HTMLInputElement).value).toBe("佐藤");
    click("[data-send='p1']");
    await settle();
    expect(page.calls).toEqual([{ kind: "correct", cid: "answers", id: "u1_p1", values: { name: "佐藤", marks: "○×○", comment: "" } }]);
  });

  it("asks the host for the own row when the state does not carry it", async () => {
    const asked: string[] = [];
    const mine: Mine = (cid, key) => {
      asked.push(`${cid}:${key}`);
      return Promise.resolve({ known: true, found: true, record: { id: "u2_p1", pollId: "p1", name: "鈴木", marks: "○△×" } });
    };
    const page = load(schedulePoll, "views/poll.html", mine);
    page.tell({ polls: [poll], answers });
    await settle();
    expect(asked).toEqual(["answers:p1"]);
    click("[data-send='p1']");
    await settle();
    expect(page.calls[0]?.kind).toBe("correct");
    expect(page.calls[0]?.id).toBe("u2_p1");
  });

  it("looks the own row up again after a first answer, so the next press corrects it", async () => {
    let answered = false;
    const mine: Mine = () =>
      Promise.resolve(
        answered ? { known: true, found: true, record: { id: "u9_p1", pollId: "p1", name: "田中", marks: "○○○" } } : { known: true, found: false },
      );
    const page = load(schedulePoll, "views/poll.html", mine);
    page.tell({ polls: [poll], answers });
    await settle();
    type("#name-p1", "田中");
    click("[data-send='p1']");
    await settle();
    expect(page.calls[0]?.kind).toBe("submit");
    answered = true;
    // The refreshed state that follows a submission.
    page.tell({ polls: [poll], answers });
    await settle();
    click("[data-send='p1']");
    await settle();
    expect(page.calls[1]?.kind).toBe("correct");
    expect(page.calls[1]?.id).toBe("u9_p1");
  });

  it("offers no form once the poll is closed", () => {
    const page = load(schedulePoll, "views/poll.html");
    page.tell({ polls: [{ ...poll, closesAt: 0 }], answers });
    expect(document.querySelector("[data-send='p1']")).toBeNull();
    expect(document.body.textContent).toContain("締め切りました");
  });
});
