import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import QuestionPane from "../../../src/components/QuestionPane.vue";
import type { AskQuestion, AskQuestionEvent } from "../../../common/askQuestion";

// What the pane emits IS the answer: the grid turns the emitted indexes into the keystrokes that
// drive the real dialog, and an index off by one presses the wrong row of a menu the user cannot
// see from here. So these pin the emitted picks rather than the rendering.
//
// The component is imported at module scope, not inside a test: an import inside an `it` bills the
// whole module graph's transform against the first test's timeout (#1314).

const question = (label: string, options: string[], multiSelect = false): AskQuestion => ({
  question: `${label}?`,
  header: label,
  options: options.map((option) => ({ label: option })),
  multiSelect,
});

const event = (questions: AskQuestion[]): AskQuestionEvent => ({ sessionId: "s1", toolUseId: "t1", questions });

const mountPane = (questions: AskQuestion[]) => mount(QuestionPane, { props: { event: event(questions) } });

const options = (w: ReturnType<typeof mountPane>) => w.findAll('[data-testid="question-option"]');

describe("QuestionPane", () => {
  it("says nothing is being asked when there is no question", () => {
    const w = mount(QuestionPane, { props: { event: null } });
    expect(w.text()).toContain("Nothing is being asked");
    expect(options(w)).toHaveLength(0);
  });

  it("renders every option of every question", () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);
    expect(options(w).map((button) => button.text())).toEqual(["Red", "Blue", "Small", "Large"]);
  });

  // The common shape. A second click on a Send button would make the pane slower than the dialog.
  it("answers on the click for a lone single-select question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    expect(w.find('[data-testid="question-send-btn"]').exists()).toBe(false);

    await options(w)[1]?.trigger("click");

    expect(w.emitted("answer")).toEqual([[[[1]]]]);
  });

  it("waits for Send once there is more than one question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);
    const send = w.find('[data-testid="question-send-btn"]');
    expect(send.attributes("disabled")).toBeDefined();

    await options(w)[0]?.trigger("click");
    expect(w.emitted("answer")).toBeUndefined(); // one question still unanswered
    await options(w)[3]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[0], [1]]]]);
  });

  // The keystrokes only ever walk DOWN the option list, so the picks have to come out ascending
  // however they were clicked — common/askQuestion.ts refuses to build a sequence otherwise.
  it("keeps multi-select picks ascending, whatever order they were clicked in", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream", "Honey"], true)]);

    await options(w)[2]?.trigger("click");
    await options(w)[0]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[0, 2]]]]);
  });

  it("toggles a multi-select option off when it is clicked again", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream"], true)]);

    await options(w)[0]?.trigger("click");
    await options(w)[0]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    // Nothing chosen is a valid answer to a multi-select question — the dialog submits with no box
    // ticked — so this emits rather than refusing.
    expect(w.emitted("answer")).toEqual([[[[]]]]);
  });

  // A single-select question replaces its pick rather than accumulating: two picks would be
  // rejected downstream, and the pane would look answered while sending nothing.
  it("replaces the pick of a single-select question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);

    await options(w)[0]?.trigger("click");
    await options(w)[1]?.trigger("click");
    await options(w)[2]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[1], [0]]]]);
  });

  // The pane outlives one question: the next arrives on the same open pane, and a pick left over
  // from the last one would be sent against a menu it never belonged to.
  it("forgets the previous question's picks when a new one arrives", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream"], true)]);
    await options(w)[0]?.trigger("click");

    await w.setProps({ event: { sessionId: "s1", toolUseId: "t2", questions: [question("Toppings", ["Nuts", "Cream"], true)] } });
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[]]]]);
  });

  // A pane that comes back with no explanation invites the same failing click again. `unwritable` is
  // the one that cannot be retried at all — the session outlived a server restart — so it has to say
  // where the answer CAN be given.
  it("says why the last answer did not send", async () => {
    const w = mount(QuestionPane, { props: { event: event([question("Color", ["Red", "Blue"])]), failure: "unwritable" as const } });

    const note = w.find('[data-testid="question-failure"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("answer in the terminal itself");
  });

  // A click after `partial` is refused by the host by design, and a refusal closes the pane without
  // a word — so the buttons must not come back offering one.
  it("offers no buttons for a failure that cannot be retried", () => {
    (["partial", "unwritable"] as const).forEach((failure) => {
      const w = mount(QuestionPane, { props: { event: event([question("Color", ["Red", "Blue"])]), failure } });
      expect(w.find('[data-testid="question-failure"]').exists()).toBe(true);
      expect(options(w)).toHaveLength(0);
      expect(w.find('[data-testid="question-send-btn"]').exists()).toBe(false);
    });
  });

  // `bad-picks` is retryable: the dialog may have moved on to a different question.
  it("keeps the buttons for a failure that can be retried", () => {
    const w = mount(QuestionPane, { props: { event: event([question("Color", ["Red", "Blue"])]), failure: "bad-picks" as const } });
    expect(options(w)).toHaveLength(2);
  });

  it("says nothing when the last answer went out", () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    expect(w.find('[data-testid="question-failure"]').exists()).toBe(false);
  });
});

// "None of the above" (#1693). The pane emits the words; declining the dialog and then saying them
// is the grid's job, because only it can reach the terminal.
describe("answering in your own words", () => {
  const other = (w: ReturnType<typeof mountPane>) => w.find('[data-testid="question-other"]');

  it("emits what was typed, trimmed", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    await other(w).setValue("  neither, use green  ");
    await w.find('[data-testid="question-other-btn"]').trigger("click");

    expect(w.emitted("say")).toEqual([["neither, use green"]]);
  });

  it("will not send nothing", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    expect(w.find('[data-testid="question-other-btn"]').attributes("disabled")).toBeDefined();

    await other(w).setValue("   ");
    await w.find('[data-testid="question-other-btn"]').trigger("click");
    expect(w.emitted("say")).toBeUndefined();
  });

  it("forgets what was typed when a new question arrives", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    await other(w).setValue("about to be stale");

    await w.setProps({ event: { sessionId: "s1", toolUseId: "t2", questions: [question("Color", ["Red", "Blue"])] } });

    expect((other(w).element as HTMLTextAreaElement).value).toBe("");
  });

  // Same rule as the option buttons: a failure that cannot be retried offers no controls.
  it("offers no text box for a failure that cannot be retried", () => {
    const w = mount(QuestionPane, { props: { event: event([question("Color", ["Red", "Blue"])]), failure: "partial" as const } });
    expect(w.find('[data-testid="question-other"]').exists()).toBe(false);
  });
});
