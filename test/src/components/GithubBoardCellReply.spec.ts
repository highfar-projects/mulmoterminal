// A cell's reply area on the board (#3185): its screen, a line sent with Enter, and Claude's question
// dialog as buttons only when the question pane is switched on.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { AskQuestionEvent } from "../../../common/askQuestion";
import type { BoardCell } from "../../../common/githubBoard";
import { setQuestionPaneEnabled } from "../../../src/composables/questionPane";

const GithubBoardCellReply = (await import("../../../src/components/GithubBoardCellReply.vue")).default;

const SESSION = "0b7d2c1e-1111-4222-8333-944455556666";
const cell = (over: Partial<BoardCell> = {}): BoardCell => ({ session: SESSION, cwd: "/w/a", working: false, waiting: false, ...over });

const question: AskQuestionEvent = {
  sessionId: SESSION,
  toolUseId: "tool-1",
  questions: [{ question: "Which way?", header: "Way", options: [{ label: "Left" }, { label: "Right" }], multiSelect: false }],
};

interface Call {
  url: string;
  init?: RequestInit | undefined;
}
let calls: Call[] = [];
let replyStatus = 200;
let releaseReply: (() => void) | null = null;
let holdQuestion = false;
let releaseQuestion: (() => void) | null = null;

beforeEach(() => {
  calls = [];
  replyStatus = 200;
  releaseReply = null;
  holdQuestion = false;
  releaseQuestion = null;
  setQuestionPaneEnabled(false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/screen")) return new Response(JSON.stringify({ screen: "Which way?\n> Left\n  Right" }));
      if (url.endsWith("/reply") && replyStatus === 0) {
        await new Promise<void>((resolve) => (releaseReply = resolve));
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/reply")) {
        return replyStatus === 200
          ? new Response(JSON.stringify({ ok: true }))
          : new Response(JSON.stringify({ error: "no live terminal" }), { status: replyStatus });
      }
      if (url === `/api/question/${SESSION}`) {
        if (holdQuestion) await new Promise<void>((resolve) => (releaseQuestion = resolve));
        return new Response(JSON.stringify({ question }));
      }
      if (url.endsWith("/answer")) return new Response(JSON.stringify({ ok: true }));
      return new Response("{}");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setQuestionPaneEnabled(false);
});

const urls = (): string[] => calls.map((call) => call.url);

describe("GithubBoardCellReply", () => {
  it("reads the screen of a waiting cell by itself", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    expect(urls()).toContain(`/api/terminal/${SESSION}/screen`);
    expect(w.get('[data-testid="board-cell-screen"]').text()).toContain("Which way?");
  });

  it("reads nothing for a cell that is not waiting, until asked", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await flushPromises();
    expect(calls).toHaveLength(0);
    await w.get('[data-testid="board-cell-screen-load"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="board-cell-screen"]').exists()).toBe(true);
  });

  it("reads the screen when the cell starts waiting", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await flushPromises();
    await w.setProps({ cell: cell({ waiting: true }) });
    await flushPromises();
    expect(urls()).toContain(`/api/terminal/${SESSION}/screen`);
  });

  it("sends the typed line and clears the box", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    const input = w.get('[data-testid="board-cell-reply-input"]');
    await input.setValue("use the left one");
    await w.get("form").trigger("submit");
    await flushPromises();
    const reply = calls.find((call) => call.url === `/api/terminal/${SESSION}/reply`);
    expect(reply?.init?.method).toBe("POST");
    expect(JSON.parse(String(reply?.init?.body))).toEqual({ text: "use the left one" });
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("sends nothing for a blank line", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await w.get('[data-testid="board-cell-reply-input"]').setValue("   ");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(calls).toHaveLength(0);
    expect(w.get('[data-testid="board-cell-reply-send"]').attributes("disabled")).toBeDefined();
  });

  it("keeps the text and says why when the terminal refused it", async () => {
    replyStatus = 409;
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    const input = w.get('[data-testid="board-cell-reply-input"]');
    await input.setValue("hello");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.get('[data-testid="board-cell-reply-error"]').text()).toBe("no live terminal");
    expect((input.element as HTMLInputElement).value).toBe("hello");
  });

  it("does not ask for the question dialog while the question pane is off", async () => {
    mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    expect(urls()).not.toContain(`/api/question/${SESSION}`);
  });

  it("offers the question's options as buttons when the question pane is on, and answers by index", async () => {
    setQuestionPaneEnabled(true);
    const w = mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    const pane = w.get('[data-testid="board-cell-reply"] section');
    expect(pane.text()).toContain("Which way?");
    expect(w.find('[data-testid="question-close-btn"]').exists()).toBe(false);
    const right = pane.findAll("button").find((button) => button.text().includes("Right"));
    await right?.trigger("click");
    await flushPromises();
    const answer = calls.find((call) => call.url === `/api/question/${SESSION}/answer`);
    expect(answer && JSON.parse(String(answer.init?.body))).toMatchObject({ toolUseId: "tool-1" });
  });
});

describe("one write at a time", () => {
  it("offers no reply box while a question dialog is up, even with text already typed", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    const input = w.get('[data-testid="board-cell-reply-input"]');
    await input.setValue("type over the dialog");
    setQuestionPaneEnabled(true);
    await w.setProps({ cell: cell({ waiting: true }) });
    await flushPromises();
    expect(input.attributes("disabled")).toBeDefined();
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(urls()).not.toContain(`/api/terminal/${SESSION}/reply`);
  });

  it("does not answer the question while a reply is still being typed", async () => {
    replyStatus = 0;
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await w.get('[data-testid="board-cell-reply-input"]').setValue("first");
    await w.get("form").trigger("submit");
    await flushPromises();
    setQuestionPaneEnabled(true);
    await w.setProps({ cell: cell({ waiting: true }) });
    await flushPromises();
    const right = w
      .get('[data-testid="board-cell-reply"] section')
      .findAll("button")
      .find((button) => button.text().includes("Right"));
    await right?.trigger("click");
    await flushPromises();
    expect(urls()).not.toContain(`/api/question/${SESSION}/answer`);
    releaseReply?.();
    await flushPromises();
  });
});

describe("while it is not yet known whether a question is open", () => {
  it("sends no reply until the question lookup has answered", async () => {
    holdQuestion = true;
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await w.get('[data-testid="board-cell-reply-input"]').setValue("too early");
    setQuestionPaneEnabled(true);
    await w.setProps({ cell: cell({ waiting: true }) });
    await flushPromises();
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(urls()).not.toContain(`/api/terminal/${SESSION}/reply`);
    releaseQuestion?.();
    await flushPromises();
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(true);
  });

  it("asks for the question when the question pane is switched on while the panel is open", async () => {
    const w = mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(false);
    setQuestionPaneEnabled(true);
    await flushPromises();
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(true);
  });

  it("drops the buttons when the pane is switched off, but keeps the reply shut until the cell stops waiting", async () => {
    setQuestionPaneEnabled(true);
    const w = mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(true);
    setQuestionPaneEnabled(false);
    await flushPromises();
    const input = w.get('[data-testid="board-cell-reply-input"]');
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(false);
    expect(input.attributes("disabled")).toBeDefined();
    await w.setProps({ cell: cell({ waiting: false }) });
    await flushPromises();
    expect(input.attributes("disabled")).toBeUndefined();
  });

  it("keeps the reply shut when the question lookup fails, rather than reading that as no question", async () => {
    setQuestionPaneEnabled(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url === `/api/question/${SESSION}`) return new Response("oops", { status: 500 });
        return new Response(JSON.stringify({ screen: "" }));
      }),
    );
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await w.get('[data-testid="board-cell-reply-input"]').setValue("into the dialog?");
    await w.setProps({ cell: cell({ waiting: true }) });
    await flushPromises();
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(urls()).not.toContain(`/api/terminal/${SESSION}/reply`);
  });

  it("lets a slow lookup from before the switch went off put nothing back", async () => {
    holdQuestion = true;
    setQuestionPaneEnabled(true);
    const w = mount(GithubBoardCellReply, { props: { cell: cell({ waiting: true }) } });
    await flushPromises();
    setQuestionPaneEnabled(false);
    await flushPromises();
    releaseQuestion?.();
    await flushPromises();
    expect(w.find('[data-testid="board-cell-reply"] section').exists()).toBe(false);
  });
});

describe("after the panel closes", () => {
  it("schedules nothing more when a reply finishes after unmount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    replyStatus = 0;
    const w = mount(GithubBoardCellReply, { props: { cell: cell() } });
    await w.get('[data-testid="board-cell-reply-input"]').setValue("late");
    await w.get("form").trigger("submit");
    await flushPromises();
    w.unmount();
    releaseReply?.();
    await flushPromises();
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(before);
    vi.useRealTimers();
  });
});
